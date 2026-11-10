import { describe, expect, it } from "vitest";
import { embeddedWechatUrl, isEmbeddedLoginResult } from "../src/shared/embedded-login";
const base = () => {
  const url = new URL("https://open.weixin.qq.com/connect/qrconnect");
  url.searchParams.set("appid", "fixture-app"); url.searchParams.set("state", "fixture-state"); url.searchParams.set("scope", "snsapi_login");
  url.searchParams.set("redirect_uri", "https://api.gfjianli.com/api/oauth/resume/callback/wechat");
  return url;
};
describe("插件内扫码登录边界", () => {
  it("保留服务端 OAuth 参数，固定框架内回调并去除外部样式地址", () => {
    const source = base(); source.searchParams.set("href", "https://evil.test/style.css");
    const url = new URL(embeddedWechatUrl(source.href));
    expect(url.searchParams.get("state")).toBe("fixture-state"); expect(url.searchParams.get("self_redirect")).toBe("true");
    expect(url.searchParams.get("login_type")).toBe("jssdk"); expect(url.searchParams.has("href")).toBe(false);
  });
  it.each(["http://open.weixin.qq.com/connect/qrconnect", "https://open.weixin.qq.com.evil.test/connect/qrconnect", "https://open.weixin.qq.com/other", "https://user@open.weixin.qq.com/connect/qrconnect"])("拒绝未授权扫码地址 %s", (value) => expect(() => embeddedWechatUrl(value)).toThrow());
  it("拒绝替换回调域名或缺失 state", () => {
    const source = base(); source.searchParams.set("redirect_uri", "https://evil.test/callback");
    expect(() => embeddedWechatUrl(source.href)).toThrow();
    const empty = base(); empty.searchParams.delete("state"); expect(() => embeddedWechatUrl(empty.href)).toThrow();
  });
  it("只接受当前扫码框架发出的官方回调，拒绝伪造来源和其他框架", () => {
    const frame = {}, other = {};
    const event = { isTrusted: true, origin: "https://jisuhaitou.gfjianli.com", source: frame };
    expect(isEmbeddedLoginResult(event, frame)).toBe(true);
    expect(isEmbeddedLoginResult({ ...event, isTrusted: false }, frame)).toBe(false);
    expect(isEmbeddedLoginResult({ ...event, origin: "https://evil.test" }, frame)).toBe(false);
    expect(isEmbeddedLoginResult({ ...event, source: other }, frame)).toBe(false);
    expect(isEmbeddedLoginResult(event, null)).toBe(false);
  });
});
