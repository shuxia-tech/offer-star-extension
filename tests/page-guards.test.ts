import { describe, expect, it } from "vitest";
import { FORM_UPDATED_NOTICE, LOGIN_READY_NOTICE, formNoticeAfterLogin, getStalePageMessage, shouldSuppressFormNotice } from "../src/panel/page-guards";

describe("Side Panel 页面过期守卫", () => {
  it("页面未变化时允许继续操作", () => {
    expect(getStalePageMessage(false, "填写")).toBeNull();
  });

  it("页面变化后阻断填写", () => {
    expect(getStalePageMessage(true, "填写")).toContain("不能填写");
  });

  it.each([["撤销"], ["确认附件"], ["点击下一步"]])("页面变化后阻断%s", (action) => {
    expect(getStalePageMessage(true, action)).toContain(`不能${action}`);
  });

  it("登录完成后清掉表单过期提示", () => {
    expect(formNoticeAfterLogin(FORM_UPDATED_NOTICE)).toBe(LOGIN_READY_NOTICE);
    expect(formNoticeAfterLogin("识别到 3 个字段")).toBeNull();
    expect(shouldSuppressFormNotice(5_000, 4_999)).toBe(true);
    expect(shouldSuppressFormNotice(5_000, 5_000)).toBe(false);
  });
});
