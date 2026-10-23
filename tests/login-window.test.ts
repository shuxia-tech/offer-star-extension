import { describe, expect, it } from "vitest";
import { OFFER_STAR_EXTENSION_LOGIN_URL, shouldCloseLoginWindow, shouldRequestLoginWindowClose, shouldSyncOfferStarLogin } from "../src/shared/login-window";

describe("插件扫码登录窗口", () => {
  it("登录地址指向官网专用入口", () => {
    expect(new URL(OFFER_STAR_EXTENSION_LOGIN_URL).href).toBe("https://offer.gfjianli.com/extension-login");
  });

  it("只有登录窗口回传有效凭证时才关闭该窗口", () => {
    expect(shouldCloseLoginWindow(7, 7, "token-1")).toBe(true);
    expect(shouldCloseLoginWindow(7, 8, "token-1")).toBe(false);
    expect(shouldCloseLoginWindow(undefined, 7, "token-1")).toBe(false);
    expect(shouldCloseLoginWindow(7, 7, null)).toBe(false);
    expect(shouldCloseLoginWindow(7, 7, "  ")).toBe(false);
  });

  it("专用登录页确认有效前不同步已有凭证，回调页和未登录页照常同步", () => {
    expect(shouldSyncOfferStarLogin("/extension-login", "stored-token", false)).toBe(false);
    expect(shouldSyncOfferStarLogin("/extension-login", "stored-token", true)).toBe(true);
    expect(shouldSyncOfferStarLogin("/extension-login", null, false)).toBe(true);
    expect(shouldSyncOfferStarLogin("/", "stored-token", false)).toBe(true);
  });

  it("关闭窗口只发生在扫码回调或已确认的登录页", () => {
    expect(shouldRequestLoginWindowClose("/extension-login", false, false)).toBe(false);
    expect(shouldRequestLoginWindowClose("/extension-login", false, true)).toBe(true);
    expect(shouldRequestLoginWindowClose("/", true, false)).toBe(true);
    expect(shouldRequestLoginWindowClose("/", false, false)).toBe(false);
  });
});
