import type { ExtensionMessage } from "../shared/messages";
import { browser } from "wxt/browser";
import { createDomEngine } from "./dom-engine";
import { extractPageContext } from "../shared/page-context";
import { installNavigationObserver } from "../shared/navigation-observer";
import { installFormMutationObserver } from "../shared/form-mutation-observer";
import { AUTOFILL_FORM_NOTICE_SETTLE_MS, createFormNoticeGate } from "../shared/form-notice-gate";
import { shouldReportPageChange } from "../shared/page-change-routing";
import { mountFloatingLauncher, mountFloatingPanel, setFloatingLauncherVisible, unmountFloatingPanel } from "./floating-launcher";
import { shouldRequestLoginWindowClose, shouldSyncOfferStarLogin } from "../shared/login-window";
import { isOfferStarAuthStorageKey, readOfferStarPageToken, tokenFromLoginCallback } from "../shared/token-sync";
import { detectSecurityChallenge } from "../shared/security-page";
import { sanitizePageUrl } from "../shared/privacy";
import { withRequestTimeout } from "../shared/request-timeout";

let engine = createDomEngine(document, location.href);
let hasScanned = false;
let pageTabId: number | undefined;
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

// 在网页右下角提供轻量入口，用户不需要反复打开浏览器工具栏。
const openFloatingPanel = () => {
  console.info("[Offer Star][Content] 用户点击网页悬浮入口，准备打开网页内面板");
  void browser.runtime.sendMessage({ type: "GET_CURRENT_TAB_ID" }).then((result: { tabId?: number | null }) => {
    const tabId = result?.tabId;
    if (!Number.isInteger(tabId) || (tabId as number) <= 0) throw new Error("无法确定当前标签页");
    const runtimeWithUrl = browser.runtime as typeof browser.runtime & { getURL: (path: string) => string };
    mountFloatingPanel(document, `${runtimeWithUrl.getURL("floating-panel.html")}?embedded=1&tabId=${tabId}`);
    setFloatingLauncherVisible(document, false);
  }).catch((error) => {
    console.error("[Offer Star][Content] 网页内悬浮面板打开失败", error);
  });
};

if (location.hostname !== "offer.gfjianli.com" || location.pathname !== "/extension-login") {
  mountFloatingLauncher(document, openFloatingPanel);
}

window.addEventListener("message", (event) => {
  const frame = document.getElementById("offer-star-floating-panel-frame") as HTMLIFrameElement | null;
  if (!frame || event.source !== frame.contentWindow) return;
  if (event.data?.type === "OFFER_STAR_CLOSE_FLOATING_PANEL") {
    console.info("[Offer Star][Content] 用户关闭网页内悬浮面板");
    unmountFloatingPanel(document);
    setFloatingLauncherVisible(document, true);
  }
});

browser.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  console.info("[Offer Star][Content] 收到消息", { 类型: message.type });
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
