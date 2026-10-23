import { describe, expect, it } from "vitest";
import { shouldAcceptPageChangeForPanel, shouldForwardPageChange, shouldReportPageChange } from "../src/shared/page-change-routing";

describe("页面变化消息路由", () => {
  it("内容脚本带有效标签页编号时允许转发", () => {
    expect(shouldForwardPageChange(12)).toBe(true);
    expect(shouldForwardPageChange(12, "https://jobs.example.com/apply")).toBe(true);
  });

  it("后台或悬浮面板消息没有标签页编号时禁止转发", () => {
    expect(shouldForwardPageChange(undefined)).toBe(false);
  });

  it("零值、负数和小数标签页编号都禁止转发", () => {
    expect(shouldForwardPageChange(0)).toBe(false);
    expect(shouldForwardPageChange(-1)).toBe(false);
    expect(shouldForwardPageChange(1.5)).toBe(false);
  });

  it("登录页、简历站和微信授权页的变化不转发到申请页", () => {
    for (const url of [
      "https://offer.gfjianli.com/extension-login",
      "https://gfjianli.com/myResume",
      "https://www.gfjianli.com/",
      "https://open.weixin.qq.com/connect/qrconnect"
    ]) {
      expect(shouldReportPageChange(url)).toBe(false);
      expect(shouldForwardPageChange(12, url)).toBe(false);
    }
  });

  it("悬浮面板只接收自己所在标签页的变化", () => {
    expect(shouldAcceptPageChangeForPanel(7, 7)).toBe(true);
    expect(shouldAcceptPageChangeForPanel(7, 8)).toBe(false);
    expect(shouldAcceptPageChangeForPanel(7, undefined)).toBe(true);
    expect(shouldAcceptPageChangeForPanel(Number.NaN, undefined)).toBe(true);
  });
});
