const NON_APPLICATION_HOSTS = new Set([
  "offer.gfjianli.com",
  "gfjianli.com",
  "www.gfjianli.com",
  "open.weixin.qq.com"
]);

/** 登录页、简历站和微信授权页不是招聘申请表，它们的跳转不能污染当前申请页。 */
export function shouldReportPageChange(pageUrl: string) {
  try {
    return !NON_APPLICATION_HOSTS.has(new URL(pageUrl).hostname);
  } catch {
    return false;
  }
}

/** 页面变化消息只允许来自申请页上的内容脚本。 */
export function shouldForwardPageChange(senderTabId: number | undefined, pageUrl?: string) {
  if (typeof senderTabId !== "number" || !Number.isInteger(senderTabId) || senderTabId <= 0) return false;
  return pageUrl === undefined || shouldReportPageChange(pageUrl);
}

/** 悬浮面板忽略其他标签页的变化；没有标签页编号的是当前页内容脚本的直接通知。 */
export function shouldAcceptPageChangeForPanel(panelTabId: number, messageTabId: number | undefined) {
  if (typeof messageTabId !== "number") return true;
  if (!Number.isInteger(panelTabId) || panelTabId <= 0) return true;
  return messageTabId === panelTabId;
}
