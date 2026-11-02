import type { ExtensionMessage } from "../shared/messages";
import { browser } from "wxt/browser";
import { createPreviewTextFill } from "./preview-fill";
import { createDomEngine } from "./dom-engine";
import { extractPageContext } from "../shared/page-context";
import { installNavigationObserver } from "../shared/navigation-observer";
import { installFormMutationObserver } from "../shared/form-mutation-observer";
import { AUTOFILL_FORM_NOTICE_SETTLE_MS, createFormNoticeGate } from "../shared/form-notice-gate";
import { shouldReportPageChange } from "../shared/page-change-routing";
import { dragFloatingPanel, mountFloatingLauncher, mountFloatingPanel, nudgeFloatingPanel, setFloatingFillState, setFloatingLauncherVisible, setFloatingPanelVisible, unmountFloatingPanel } from "./floating-launcher";
import { isFloatingFillBusy, isFloatingFillState, type FloatingFillState } from "../shared/floating-state";
import { shouldRequestLoginWindowClose, shouldSyncOfferStarLogin } from "../shared/login-window";
import { isOfferStarAuthStorageKey, readOfferStarPageToken, tokenFromLoginCallback } from "../shared/token-sync";
import { detectSecurityChallenge } from "../shared/security-page";
import { sanitizePageUrl } from "../shared/privacy";
import { withRequestTimeout } from "../shared/request-timeout";

let engine = createDomEngine(document, location.href);
const previewTextFill = createPreviewTextFill(document);
const extensionRuntime = browser.runtime as typeof browser.runtime & { getURL: (path: string) => string };
let hasScanned = false;
let pageTabId: number | undefined;
let quickFillPending = false;
let quickFillTimer: number | undefined;
let floatingBusy = false;
let lastFloatingState: FloatingFillState = "idle";
function clearQuickFillPending() {
  quickFillPending = false;
  window.clearTimeout(quickFillTimer);
}
void browser.runtime.sendMessage({ type: "GET_CURRENT_TAB_ID" }).then((result: { tabId?: number | null }) => {
  if (Number.isInteger(result?.tabId) && (result.tabId as number) > 0) pageTabId = result.tabId as number;
}).catch(() => undefined);

function notifyPanel(message: { type: "PAGE_FORM_CHANGED"; url: string } | { type: "PAGE_CONTEXT_CHANGED"; url: string; reason: string }) {
  // 直接发给悬浮面板。不要再经后台回发，否则内容脚本会一直等这条回发，扫描请求进不来。
  void browser.runtime.sendMessage({ ...message, tabId: pageTabId }).catch(() => undefined);
}
const formNoticeGate = createFormNoticeGate(
  (callback, milliseconds) => window.setTimeout(callback, milliseconds),
  (id) => window.clearTimeout(id as number)
);

installNavigationObserver(window, ({ url, reason }) => {
  clearQuickFillPending();
  previewTextFill.clear();
  floatingBusy = false;
  setFloatingFillState(document, "idle");
  engine = createDomEngine(document, url);
  hasScanned = false;
  unmountFloatingPanel(document);
  setFloatingLauncherVisible(document, true);
  if (!shouldReportPageChange(url)) return;
  console.info("[Offer Star][Content] 检测到页面导航，已使旧字段映射失效", { 地址: sanitizePageUrl(url), 原因: reason });
  notifyPanel({ type: "PAGE_CONTEXT_CHANGED", url, reason });
});

installFormMutationObserver(document, () => {
  if (!hasScanned || formNoticeGate.isHeld() || !shouldReportPageChange(location.href)) return;
  console.info("[Offer Star][Content] 检测到表单结构异步更新，提示重新扫描", { 地址: sanitizePageUrl(location.href) });
  notifyPanel({ type: "PAGE_FORM_CHANGED", url: location.href });
}, () => formNoticeGate.isHeld());

// 只有用户点击快捷条才创建填写 iframe，普通悬停不读取账号和简历。
const ensureFloatingPanel = async (visible: boolean) => {
  const result = await browser.runtime.sendMessage({ type: "GET_CURRENT_TAB_ID" }) as { tabId?: number | null };
  const tabId = result?.tabId;
  if (!Number.isInteger(tabId) || (tabId as number) <= 0) throw new Error("无法确定当前标签页");
  pageTabId = tabId as number;
  const panel = mountFloatingPanel(document, `${extensionRuntime.getURL("floating-panel.html")}?embedded=1&tabId=${tabId}`);
  setFloatingPanelVisible(document, visible);
  setFloatingLauncherVisible(document, !visible);
  return panel;
};
const openFloatingPanel = () => {
  void ensureFloatingPanel(true).catch(() => setFloatingFillState(document, "error"));
};
const sendQuickFill = () => {
  clearQuickFillPending();
  void browser.runtime.sendMessage({ type: "FLOATING_FILL_COMMAND", action: "start" } satisfies ExtensionMessage)
    .catch(() => { floatingBusy = false; setFloatingFillState(document, "error"); });
};
const quickFill = () => {
  if (floatingBusy || quickFillPending) return;
  // 官网补全简历后重试时重新加载列表，无需刷新申请网页。
  if (["missing", "error", "login"].includes(lastFloatingState)) unmountFloatingPanel(document);
  quickFillPending = true;
  floatingBusy = true;
  setFloatingFillState(document, "loading");
  quickFillTimer = window.setTimeout(() => {
    clearQuickFillPending(); floatingBusy = false; setFloatingFillState(document, "error");
  }, 35000);
  void ensureFloatingPanel(false).then((panel) => {
    if (quickFillPending && panel.dataset.ready === "true") sendQuickFill();
  }).catch(() => { clearQuickFillPending(); floatingBusy = false; setFloatingFillState(document, "error"); });
};

if (location.hostname !== "offer.gfjianli.com" || location.pathname !== "/extension-login") {
  const runtimeWithUrl = browser.runtime as typeof browser.runtime & { getURL: (path: string) => string };
  mountFloatingLauncher(document, openFloatingPanel, runtimeWithUrl.getURL("icons/icon128.png"), quickFill, () => window.open("https://gfjianli.com/", "_blank", "noopener,noreferrer"));
}

window.addEventListener("message", (event) => {
  if (!event.isTrusted) return;
  const frame = document.getElementById("offer-star-floating-panel-frame") as HTMLIFrameElement | null;
  if (!frame || event.source !== frame.contentWindow) return;
  if (event.origin !== extensionRuntime.getURL("").replace(/\/$/, "")) return;
  if (event.data?.type === "OFFER_STAR_PANEL_READY") {
    const panel = document.getElementById("offer-star-floating-panel");
    if (panel) panel.dataset.ready = "true";
    if (quickFillPending) sendQuickFill();
  }
  if (event.data?.type === "OFFER_STAR_DOCK_STATE" && isFloatingFillState(event.data.state)) {
    // 初始化期间不能用 idle 覆盖用户刚发起的读取状态。
    if (!quickFillPending) {
      floatingBusy = isFloatingFillBusy(event.data.state);
      lastFloatingState = event.data.state;
      setFloatingFillState(document, event.data.state);
    }
  }
  if (event.data?.type === "OFFER_STAR_PANEL_DRAG" && ["start", "move", "end"].includes(event.data.stage)) {
    dragFloatingPanel(document, event.data.stage, event.data.x, event.data.y);
  }
  if (event.data?.type === "OFFER_STAR_PANEL_NUDGE") nudgeFloatingPanel(document, event.data.dx, event.data.dy);
  if (event.data?.type === "OFFER_STAR_CLOSE_FLOATING_PANEL") {
    console.info("[Offer Star][Content] 用户关闭网页内悬浮面板");
    if (floatingBusy) setFloatingPanelVisible(document, false);
    else unmountFloatingPanel(document);
    setFloatingLauncherVisible(document, true);
  }
});

browser.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  console.info("[Offer Star][Content] 收到消息", { 类型: message.type });
  if (message.type === "FILL_FOCUSED_TEXT") {
    // 手动文字填写只接收扩展面板经后台发送的命令，网页脚本不能直接触发。
    if (_sender.id !== browser.runtime.id || !_sender.url?.startsWith(extensionRuntime.getURL(""))) {
      sendResponse({ filled: false, error: "请从极速海投的简历预览中双击填写" });
      return false;
    }
    formNoticeGate.engage();
    try { sendResponse(previewTextFill.fill(message.value)); }
    catch { sendResponse({ filled: false, error: "网页未接受这次填写，请单击复制后手动粘贴" }); }
    finally { formNoticeGate.releaseAfter(AUTOFILL_FORM_NOTICE_SETTLE_MS); }
    return false;
  }
  if (message.type === "SCAN_PAGE") {
    const blockedReason = detectSecurityChallenge(document, location.href);
    if (blockedReason) {
      hasScanned = false;
      console.warn("[Offer Star][Content] 检测到安全验证页面，已停止字段扫描", { 原因: blockedReason });
      sendResponse({ fields: [], blockedReason });
      return false;
    }
    formNoticeGate.engage();
    console.info("[Offer Star][Content] 开始扫描当前页面");
    void engine.scanDeep().then((fields) => {
      hasScanned = true;
      formNoticeGate.releaseAfter(AUTOFILL_FORM_NOTICE_SETTLE_MS);
      sendResponse({ fields });
    }).catch((error) => {
      formNoticeGate.releaseAfter(0);
      console.error("[Offer Star][Content] 页面扫描失败", error);
      sendResponse({ fields: [], blockedReason: "页面扫描失败，请展开申请表后重试" });
    });
    return true;
  }
  if (message.type === "OPEN_FLOATING_PANEL") {
    openFloatingPanel();
    return false;
  }
  if (message.type === "GET_PAGE_CONTEXT") {
    sendResponse(extractPageContext(document, location.href));
    return false;
  }
  if (message.type === "FILL_FIELDS") {
    formNoticeGate.engage();
    void engine.fill(message.values, message.mode, { debug: message.debug }).then(sendResponse).finally(() => {
      formNoticeGate.releaseAfter(AUTOFILL_FORM_NOTICE_SETTLE_MS);
    });
    return true;
  }
  if (message.type === "UNDO_FILL") {
    void engine.undo().then(sendResponse);
    return true;
  }
  if (message.type === "ADVANCE_FORM_STEP") {
    void engine.advanceStep().then(sendResponse);
    return true;
  }
  if (message.type === "FILL_PHOTO") {
    void engine.fillPhoto(message.dataUrl, message.fileName, message.mimeType).then(sendResponse);
    return true;
  }
  if (message.type === "FILL_FILES") {
    void engine.fillFiles(message.files).then(sendResponse);
    return true;
  }
  return false;
});

// 只在 Offer Star 官网同步当前登录状态，不读取其他网站的 localStorage。
if (location.hostname === "offer.gfjianli.com") {
  let lastOfferStarToken: string | null | undefined;
  let lastCloseRequested = false;
  let tokenSyncPending = false;
  const syncOfferStarToken = (source: string) => {
    const token = readOfferStarPageToken(location.search);
    const loginReady = document.documentElement.dataset.offerStarLogin === "ready";
    if (token !== lastOfferStarToken) lastCloseRequested = false;
    if (!shouldSyncOfferStarLogin(location.pathname, token, loginReady)) return;
    const closeLoginWindow = shouldRequestLoginWindowClose(location.pathname, Boolean(tokenFromLoginCallback(location.search)), loginReady);
    if (tokenSyncPending || (token === lastOfferStarToken && !(closeLoginWindow && !lastCloseRequested))) return;
    tokenSyncPending = true;
    console.info("[Offer Star][Content] 官网登录状态发生变化，申请同步扩展授权", { 来源: source, 已登录: Boolean(token), 关闭登录窗口: closeLoginWindow });
    void withRequestTimeout(browser.runtime.sendMessage({ type: "SYNC_OFFER_STAR_TOKEN", token, closeLoginWindow }), 8000, "登录同步超时")
      .then((result) => {
        if (!result?.success) return;
        lastOfferStarToken = token;
        if (closeLoginWindow) lastCloseRequested = true;
      }).catch(() => {
        console.warn("[Offer Star][Content] 登录同步暂未完成，将重试；更新扩展后请刷新官网");
      }).finally(() => { tokenSyncPending = false; });
  };
  syncOfferStarToken("页面初始化");
  window.addEventListener("storage", (event) => {
    if (!isOfferStarAuthStorageKey(event.key)) return;
    syncOfferStarToken("storage 事件");
  });
  // 登录回调与当前页面属于同一文档时，storage 事件不会在当前文档触发；短轮询确保登录后无需刷新页面。
  window.setInterval(() => syncOfferStarToken("登录状态轮询"), 1000);
  new MutationObserver(() => syncOfferStarToken("登录页确认")).observe(document.documentElement, { attributes: true, attributeFilter: ["data-offer-star-login"] });
}
