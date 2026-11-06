import { describe, expect, it } from "vitest";
import { buildResumeManageUrl } from "../src/shared/resume-manage-url";

describe("简历管理页地址", () => {
  it("打开新站简历页，不在跳转链接中附加登录凭证", () => {
    expect(buildResumeManageUrl()).toBe("https://jisuhaitou.gfjianli.com/resume");
  });
});
