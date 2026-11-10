import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import { readOfferStarPageToken } from "../src/shared/token-sync";
import { shouldSyncOfferStarLogin } from "../src/shared/login-window";

/** 只在官网子框架同步扫码结果，不向子框架注入悬浮条或填写引擎。 */
export default defineContentScript({
  matches: ["https://jisuhaitou.gfjianli.com/*"], allFrames: true, runAt: "document_idle",
  main() {
    if (window.top === window) return;
    const origin = (browser.runtime as typeof browser.runtime & { getURL: (path: string) => string }).getURL("").replace(/\/$/, "");
    const sync = () => {
      const token = readOfferStarPageToken(location.search);
      if (!token || !shouldSyncOfferStarLogin(location.pathname, token, document.documentElement.dataset.offerStarLogin === "ready")) return;
      // 定向发给当前插件 iframe；普通网页作为父页时无法收到凭证。
      window.parent.postMessage({ type: "OFFER_STAR_EMBEDDED_LOGIN_RESULT", token }, origin);
    };
    const timer = window.setInterval(sync, 1000);
    sync(); window.setTimeout(() => window.clearInterval(timer), 120000);
  }
});
