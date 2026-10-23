export const OFFER_STAR_EXTENSION_LOGIN_URL = "https://offer.gfjianli.com/extension-login";

export function shouldCloseLoginWindow(loginWindowId: number | undefined, senderWindowId: number | undefined, token: string | null) {
  return Boolean(token?.trim()) && typeof loginWindowId === "number" && senderWindowId === loginWindowId;
}

/** 专用登录页在确认凭证有效前，不把已有官网凭证同步进来，避免过期凭证把窗口立刻关掉。 */
export function shouldSyncOfferStarLogin(pathname: string, token: string | null, loginReady: boolean) {
  if (pathname !== "/extension-login") return true;
  if (!token?.trim()) return true;
  return loginReady;
}

/** 新扫码回调，或专用登录页确认已有凭证有效后，才请求关闭登录窗口。 */
export function shouldRequestLoginWindowClose(pathname: string, hasCallbackToken: boolean, loginReady: boolean) {
  if (pathname === "/extension-login") return loginReady;
  return hasCallbackToken;
}
