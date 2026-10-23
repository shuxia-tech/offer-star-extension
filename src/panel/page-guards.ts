export const FORM_UPDATED_NOTICE = "页面表单已更新，请重新扫描后再填写";
export const LOGIN_READY_NOTICE = "已登录，选择简历后可以扫描填写";
/** 登录弹窗关闭后，申请页常会因焦点切回重绘，这段时间内不把重绘当成表单过期。 */
export const LOGIN_FORM_NOTICE_SUPPRESS_MS = 5000;

/** 页面表单发生异步更新后，旧扫描结果不能继续驱动写入或导航。 */
export function getStalePageMessage(pageStale: boolean, action: string) {
  return pageStale ? `页面表单已更新，不能${action}，请重新扫描后再试` : null;
}

/** 登录刚完成时，若状态栏还停在表单过期提示，换成可继续操作的说明。 */
export function formNoticeAfterLogin(message: string) {
  return message === FORM_UPDATED_NOTICE ? LOGIN_READY_NOTICE : null;
}

export function shouldSuppressFormNotice(suppressUntil: number, now: number) {
  return suppressUntil > now;
}
