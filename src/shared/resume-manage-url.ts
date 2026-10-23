const RESUME_MANAGE_URL = "https://gfjianli.com/myResume";

/** 高分简历通过地址栏 token 写入登录态，落地后页面会自行去掉该参数。 */
export function buildResumeManageUrl(token: string | null | undefined) {
  const url = new URL(RESUME_MANAGE_URL);
  const value = token?.trim();
  if (value) url.searchParams.set("token", value);
  return url.toString();
}
