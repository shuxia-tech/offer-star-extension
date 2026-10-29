import type { ExtensionMessage, ResumeProfile, ResumeSummary } from "../shared/messages";
import { browser } from "wxt/browser";
import { normalizeResumeList, normalizeResumeProfile } from "../shared/resume-profile";
import { requestAiGateway } from "../shared/ai-request";
import { RESUME_SESSION_STORAGE_KEYS } from "../shared/auth-session";
import { requestResumeApi, ResumeSessionExpiredError } from "../shared/resume-request";
import { clearResumeCacheKeys, isResumeCacheFresh, profileCacheKey, RESUME_LIST_CACHE_KEY, type CachedResumeList, type CachedResumeProfile } from "../shared/resume-cache";
import { pageRelayRequest } from "../shared/page-relay";
import { buildResumeManageUrl } from "../shared/resume-manage-url";
import { buildAiRequestBody, sanitizePageUrl } from "../shared/privacy";
import { isOfferStarPage, reconnectOfferStarLogin } from "../shared/login-reconnect";
import { OFFER_STAR_EXTENSION_LOGIN_URL, shouldCloseLoginWindow } from "../shared/login-window";
import { withRequestTimeout } from "../shared/request-timeout";
import { readOfferStarTokenInPage } from "../shared/token-sync";
import { normalizeUserProfile } from "../shared/user-profile";

const API_BASE = "https://api.gfjianli.com/api";
const EXTENSION_AI_URL = import.meta.env.VITE_OFFER_STAR_AI_URL || "https://offer.gfjianli.com/api/extension/ai/analyze";
let loginWindowId: number | undefined;

browser.windows.onRemoved.addListener((windowId) => {
  if (windowId === loginWindowId) loginWindowId = undefined;
});

browser.runtime.onInstalled.addListener(() => {
  console.info("[Offer Star][Background] 扩展安装或更新完成");
});

// 浏览器工具栏图标也打开网页内悬浮面板，保持 Chrome、Edge、Firefox 的主交互一致。
// Chromium 使用 action，Firefox MV2 可能仍使用 browserAction；只注册实际存在的 API。
const toolbarApis = browser as unknown as {
  action?: typeof browser.action;
  browserAction?: typeof browser.action;
};
const toolbarAction = toolbarApis.action ?? toolbarApis.browserAction;
toolbarAction?.onClicked.addListener((tab) => {
  if (!tab.id) return;
  console.info("[Offer Star][Background] 用户点击工具栏图标，打开网页内悬浮面板", { 标签页: tab.id });
  void browser.tabs.sendMessage(tab.id, { type: "OPEN_FLOATING_PANEL" }).catch((error) => {
    console.warn("[Offer Star][Background] 当前页面无法打开网页内悬浮面板", error);
  });
});

browser.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  console.info("[Offer Star][Background] 收到消息", { 类型: message.type, 标签页: sender.tab?.id });
  if (message.type === "GET_RESUME_PROFILE") {
    void getResumeProfile(message.resumeId).then(sendResponse).catch((error) => {
      console.error("[Offer Star][Background] 获取简历失败", error);
      sendResponse({ error: error instanceof Error ? error.message : "请求失败" });
    });
    return true;
  }
  if (message.type === "GET_CURRENT_TAB_ID") {
    sendResponse({ tabId: sender.tab?.id ?? null });
    return false;
  }
  if (message.type === "GET_USER_PROFILE") {
    void getUserProfile().then(sendResponse).catch((error) => {
      console.error("[Offer Star][Background] 获取用户资料失败", error);
      sendResponse({ error: error instanceof Error ? error.message : "用户资料加载失败" });
    });
    return true;
  }
  if (message.type === "OPEN_OFFER_STAR_LOGIN") {
    // 由后台页创建扫码窗口，避免网页内 iframe 直接开窗时被浏览器拦截。
    void openOfferStarLoginWindow().then((result) => {
      console.info("[Offer Star][Background] 已打开微信扫码窗口", { 窗口: result.windowId, 复用: result.reused });
      sendResponse({ success: true, windowId: result.windowId });
    }).catch((error) => {
      console.error("[Offer Star][Background] 打开微信扫码窗口失败", error);
      sendResponse({ success: false, error: "无法打开微信扫码窗口，请检查浏览器权限或手动打开官网" });
    });
    return true;
  }
  if (message.type === "OPEN_OFFER_STAR_RESUME") {
    // 简历管理页由后台页创建标签页，避免网页 iframe 受浏览器弹窗策略影响。
    void openResumeManagePage().then((tab) => {
      console.info("[Offer Star][Background] 已打开简历管理页", { 标签页: tab.id });
      sendResponse({ success: true, tabId: tab.id });
    }).catch((error) => {
      console.error("[Offer Star][Background] 打开简历管理页失败", error);
      sendResponse({ success: false, error: "无法打开简历管理页，请手动打开高分简历" });
    });
    return true;
  }
  if (message.type === "SYNC_OFFER_STAR_TOKEN") {
    if (isOfferStarPage(sender.url)) {
      const token = message.token?.trim() || null;
      const closeWindow = Boolean(message.closeLoginWindow) && shouldCloseLoginWindow(loginWindowId, sender.tab?.windowId, token);
      void (token
        ? browser.storage.local.set({ extensionToken: token })
        : clearResumeSessionStorage()).then(() => {
          console.info("[Offer Star][Background] 已同步网站登录状态到扩展", { 已登录: Boolean(token) });
          sendResponse({ success: true });
          if (!closeWindow || typeof loginWindowId !== "number") return;
          const windowId = loginWindowId;
          loginWindowId = undefined;
          void browser.windows.remove(windowId).catch((error) => {
            console.warn("[Offer Star][Background] 登录窗口关闭失败", error);
          });
        }).catch(() => {
          console.warn("[Offer Star][Background] 登录状态同步失败，请刷新官网重试");
          sendResponse({ success: false });
        });
      return true;
    } else {
      console.warn("[Offer Star][Background] 拒绝非 Offer Star 页面同步登录状态");
      sendResponse({ success: false });
    }
    return false;
  }
  if (message.type === "RECONNECT_OFFER_STAR_LOGIN") {
    // 只允许扩展面板发起，普通网页内容脚本不能请求读取官网授权。
    const runtimeWithUrl = browser.runtime as typeof browser.runtime & { getURL: (path: string) => string };
    if (!sender.url?.startsWith(runtimeWithUrl.getURL(""))) {
      sendResponse({ success: false, error: "请从扩展面板刷新登录状态" });
      return false;
    }
    void withRequestTimeout((async () => reconnectOfferStarLogin({
      tabs: await browser.tabs.query({ url: "https://offer.gfjianli.com/*" }),
      readToken: async (tabId) => {
        const results = await browser.scripting.executeScript({
          target: { tabId },
          func: readOfferStarTokenInPage
        });
        const token = results[0]?.result;
        return typeof token === "string" ? token : null;
      },
      saveToken: async (token) => { await browser.storage.local.set({ extensionToken: token }); }
    }))(), 8000, "官网登录同步超时，请刷新官网后重试").then(sendResponse).catch((error) => {
      sendResponse({ success: false, error: error instanceof Error ? error.message : "官网登录同步失败" });
    });
    return true;
  }
  if (message.type === "CLEAR_EXTENSION_TOKEN") {
    void clearResumeSessionStorage().then(() => {
      console.info("[Offer Star][Background] 已清除扩展登录状态");
      sendResponse({ success: true });
    }).catch((error) => {
      console.error("[Offer Star][Background] 清除扩展登录状态失败", error);
      sendResponse({ success: false, error: "清除登录状态失败" });
    });
    return true;
  }
  if (message.type === "GET_RESUME_LIST") {
    void getResumeList().then(sendResponse).catch((error) => {
      console.error("[Offer Star][Background] 获取简历列表失败", error);
      sendResponse({ error: error instanceof Error ? error.message : "请求失败" });
    });
    return true;
  }
  if (message.type === "ANALYZE_PAGE_WITH_AI") {
    void analyzePageWithAi(message).then(sendResponse).catch((error) => {
      console.error("[Offer Star][Background] AI 页面分析失败", error);
      sendResponse({ error: error instanceof Error ? error.message : "AI 分析失败" });
    });
    return true;
  }
  const runtimeWithUrl = browser.runtime as typeof browser.runtime & { getURL: (path: string) => string };
  const relay = pageRelayRequest(message, Boolean(sender.url?.startsWith(runtimeWithUrl.getURL(""))));
  if (relay) {
    console.info("[Offer Star][Background] 正在把页面操作发给申请页", { 类型: relay.message.type, 标签页: relay.tabId });
    browser.tabs.sendMessage(relay.tabId, relay.message).then(sendResponse).catch(() => {
      sendResponse({ relayError: "无法连接当前页面，请刷新后重试" });
    });
    return true;
  }
  // 页面变化由内容脚本直接通知悬浮面板。后台再回发会和扫描互相等待，内容脚本就进不了 scan()。
  if (message.type === "PAGE_CONTEXT_CHANGED" || message.type === "PAGE_FORM_CHANGED") return false;
  if (message.type === "SCAN_PAGE" && sender.tab?.id) {
    browser.tabs.sendMessage(sender.tab.id, message).then(sendResponse).catch(() => sendResponse({ fields: [] }));
    return true;
  }
  if (message.type === "FILL_FIELDS" && sender.tab?.id) {
    browser.tabs.sendMessage(sender.tab.id, message).then(sendResponse).catch(() => sendResponse({ filled: [], failed: ["页面通信"], failureReasons: { "页面通信": "无法连接当前页面，请刷新后重试" } }));
    return true;
  }
  return false;
});

async function openOfferStarLoginWindow() {
  if (typeof loginWindowId === "number") {
    try {
      await browser.windows.update(loginWindowId, { focused: true });
      return { windowId: loginWindowId, reused: true };
    } catch (error) {
      console.warn("[Offer Star][Background] 原登录窗口已不存在，重新打开", error);
      loginWindowId = undefined;
    }
  }
  const created = await browser.windows.create({
    url: OFFER_STAR_EXTENSION_LOGIN_URL,
    type: "popup",
    width: 680,
    height: 760,
    focused: true
  });
  if (typeof created?.id !== "number") throw new Error("浏览器没有返回登录窗口");
  loginWindowId = created.id;
  return { windowId: created.id, reused: false };
}

async function openResumeManagePage() {
  const { extensionToken } = await browser.storage.local.get("extensionToken") as { extensionToken?: string };
  const token = typeof extensionToken === "string" ? extensionToken : null;
  return browser.tabs.create({ url: buildResumeManageUrl(token) });
}

async function getResumeProfile(resumeId: string): Promise<ResumeProfile> {
  console.info("[Offer Star][Background] 开始获取简历", { 简历编号: resumeId });
  const { extensionToken } = await browser.storage.local.get("extensionToken") as { extensionToken?: string };
  if (!extensionToken) throw new Error("请先登录 Offer Star");
  const cacheKey = profileCacheKey(resumeId);
  try {
    const response = await requestOfferStar(`/c/resume/${encodeURIComponent(resumeId)}`, extensionToken);
    const profile = normalizeResumeProfile(response);
    await browser.storage.local.set({ [cacheKey]: { value: profile, savedAt: Date.now() } satisfies CachedResumeProfile });
    console.info("[Offer Star][Background] 简历获取成功", { 简历编号: resumeId });
    return profile;
  } catch (error) {
    if (error instanceof ResumeSessionExpiredError) throw error;
    const stored = await browser.storage.local.get(cacheKey) as Record<string, CachedResumeProfile | undefined>;
    if (isResumeCacheFresh(stored[cacheKey])) {
      console.warn("[Offer Star][Background] 简历接口暂时不可用，使用短时缓存", { 简历编号: resumeId });
      return stored[cacheKey]!.value;
    }
    throw error;
  }
}

async function getUserProfile() {
  const { extensionToken } = await browser.storage.local.get("extensionToken") as { extensionToken?: string };
  if (!extensionToken) throw new Error("请先登录 Offer Star");
  const response = await requestOfferStar("/auth/c/getLoginUser/offer", extensionToken);
  return normalizeUserProfile(response);
}

async function getResumeList(): Promise<ResumeSummary[]> {
  const { extensionToken } = await browser.storage.local.get("extensionToken") as { extensionToken?: string };
  if (!extensionToken) throw new Error("请先登录 Offer Star");
  try {
    const response = await requestOfferStar("/c/resume/templates/my?page=1&limit=100", extensionToken);
    const list = normalizeResumeList(response);
    await browser.storage.local.set({ [RESUME_LIST_CACHE_KEY]: { value: list, savedAt: Date.now() } satisfies CachedResumeList });
    console.info("[Offer Star][Background] 简历列表获取成功", { 数量: list.length });
    return list;
  } catch (error) {
    if (error instanceof ResumeSessionExpiredError) throw error;
    const stored = await browser.storage.local.get(RESUME_LIST_CACHE_KEY) as Record<string, CachedResumeList | undefined>;
    if (isResumeCacheFresh(stored[RESUME_LIST_CACHE_KEY])) {
      console.warn("[Offer Star][Background] 简历列表接口暂时不可用，使用短时缓存");
      return stored[RESUME_LIST_CACHE_KEY]!.value;
    }
    throw error;
  }
}

async function clearResumeSessionStorage() {
  const stored = await browser.storage.local.get(null);
  const cacheKeys = clearResumeCacheKeys(Object.keys(stored));
  await browser.storage.local.remove([...RESUME_SESSION_STORAGE_KEYS, ...cacheKeys]);
}

async function requestOfferStar(path: string, token: string): Promise<unknown> {
  try {
    return await requestResumeApi(`${API_BASE}${path}`, token);
  } catch (error) {
    if (error instanceof ResumeSessionExpiredError) {
      const current = await browser.storage.local.get("extensionToken");
      // 旧请求的未授权响应不能清掉用户刚完成的新登录。
      if (current.extensionToken === token) {
        await clearResumeSessionStorage();
        console.warn("[Offer Star][Background] 登录状态已失效，已清除本地扩展授权");
      }
    }
    throw error;
  }
}

async function analyzePageWithAi(message: Extract<ExtensionMessage, { type: "ANALYZE_PAGE_WITH_AI" }>) {
  const { extensionToken } = await browser.storage.local.get("extensionToken") as { extensionToken?: string };
  if (!extensionToken) throw new Error("请先登录 Offer Star");
  try {
    return await requestAiGateway(EXTENSION_AI_URL, extensionToken, buildAiRequestBody(message), {
      timeoutMs: 15_000,
      retries: 1,
      retryDelayMs: 500
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("AI 请求失败：401")) {
      await clearResumeSessionStorage();
      console.warn("[Offer Star][Background] AI 网关判定登录失效，已清除本地扩展授权");
    }
    throw error;
  }
}
