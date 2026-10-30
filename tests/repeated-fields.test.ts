/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createDomEngine } from "../src/content/dom-engine";
import { buildResumeFieldValues } from "../src/shared/fill-values";

describe("重复表单区块填写", () => {
  it("按页面出现顺序填写多段工作经历", async () => {
    document.body.innerHTML = `
      <label>公司<input name="company-1" /></label>
      <label>职位<input name="position-1" /></label>
      <label>公司<input name="company-2" /></label>
      <label>职位<input name="position-2" /></label>
    `;
    const engine = createDomEngine(document, "https://www.zhipin.com/job/1");
    const result = await engine.fill({ company: ["甲公司", "乙公司"], position: ["产品经理", "运营经理"] }, "overwrite");
    expect(result.filled).toEqual(["company", "position", "company", "position"]);
    expect(Array.from(document.querySelectorAll<HTMLInputElement>("input")).map((input) => input.value)).toEqual(["甲公司", "产品经理", "乙公司", "运营经理"]);
  });

  it("简历数据存在多段经历时生成数组值", () => {
    const values = buildResumeFieldValues({
      basic: { name: "张三", phone: "", email: "" },
      education: [],
      workExperience: [
        { company: "甲公司", position: "产品经理" },
        { company: "乙公司", position: "运营经理" }
      ],
      skills: []
    });
    expect(values.company).toEqual(["甲公司", "乙公司"]);
    expect(values.position).toEqual(["产品经理", "运营经理"]);
  });
});
