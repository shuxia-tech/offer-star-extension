import { describe, expect, it } from "vitest";
import { buildResumeManageUrl } from "../src/shared/resume-manage-url";

describe("简历管理页地址", () => {
  it("携带登录凭证打开高分简历", () => {
    expect(buildResumeManageUrl("session-token")).toBe("https://gfjianli.com/myResume?token=session-token");
  });

  it("凭证中的特殊字符会被编码", () => {
    expect(buildResumeManageUrl("a+b/c=")).toBe("https://gfjianli.com/myResume?token=a%2Bb%2Fc%3D");
  });

  it("没有凭证时不附加空参数", () => {
    expect(buildResumeManageUrl(null)).toBe("https://gfjianli.com/myResume");
    expect(buildResumeManageUrl("  ")).toBe("https://gfjianli.com/myResume");
  });
});
