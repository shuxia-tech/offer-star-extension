import { OFFICIAL_SITE_URL } from "./site-links";

/** 与官网一致，只把服务端返回的邀请码编码进分享链接，不携带登录凭证。 */
export function buildInviteLink(code: unknown) {
  if (typeof code !== "string" || !code.trim() || code.length > 128) return null;
  const url = new URL(OFFICIAL_SITE_URL);
  url.searchParams.set("invitationCode", code.trim());
  return url.href;
}
