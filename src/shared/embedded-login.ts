import { OFFICIAL_SITE_ORIGIN } from "./site-links";

/** 仅接受既有服务端签发的微信网站扫码地址；不允许任意远程页面进入登录框。 */
export function embeddedWechatUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("未获取到微信扫码地址，请刷新重试");
  const url = new URL(value);
  if (url.origin !== "https://open.weixin.qq.com" || url.pathname !== "/connect/qrconnect" || url.username || url.password) throw new Error("微信扫码地址异常，请使用官网登录");
  const callback = new URL(url.searchParams.get("redirect_uri") ?? "");
  if (callback.origin !== "https://api.gfjianli.com" || callback.pathname !== "/api/oauth/resume/callback/wechat" || callback.username || callback.password) throw new Error("登录回调地址异常，请使用官网登录");
  if (!url.searchParams.get("appid") || !url.searchParams.get("state") || url.searchParams.get("scope") !== "snsapi_login") throw new Error("微信扫码参数不完整，请刷新重试");
  // 与微信官方 WxLogin 内嵌方式一致，回调留在子框架，不替换用户的申请页。
  const allowed = ["appid", "redirect_uri", "scope", "state", "response_type"];
  for (const key of [...url.searchParams.keys()]) if (!allowed.includes(key)) url.searchParams.delete(key);
  url.searchParams.set("login_type", "jssdk");
  url.searchParams.set("self_redirect", "true");
  url.searchParams.set("style", "black");
  url.hash = "";
  return url.href;
}

/** 回调必须来自当前二维码框架，不能接受申请网页伪造的登录消息。 */
export function isEmbeddedLoginResult(event: { isTrusted: boolean; origin: string; source: unknown }, frame: unknown) {
  return Boolean(frame) && event.isTrusted && event.origin === OFFICIAL_SITE_ORIGIN && event.source === frame;
}
