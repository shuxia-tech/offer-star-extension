/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createDomEngine } from "../src/content/dom-engine";

const fixtures = [
  {
    name: "标准 autocomplete 控件",
    url: "https://unknown-company.example/apply/1",
    html: `<form><input autocomplete="name" /><input autocomplete="email" /><input autocomplete="tel" /></form>`,
    expected: ["name", "email", "phone"],
    values: { name: "张三", email: "zhangsan@example.com", phone: "13800000000" }
  },
  {
    name: "控件 type 语义",
    url: "https://unknown-company.example/apply/semantic",
    html: `<input type="email" /><input type="tel" />`,
    expected: ["email", "phone"],
    values: { email: "zhangsan@example.com", phone: "13800000000" }
  },
  {
    name: "label for 关联控件",
    url: "https://careers.example.cn/form",
    html: `<label for="real-name">真实姓名</label><input id="real-name" /><label for="school">毕业院校</label><input id="school" /><label for="degree">学历</label><select id="degree"><option>本科</option><option>硕士</option></select>`,
    expected: ["name", "school", "degree"],
    values: { name: "张三", school: "示例大学", degree: "硕士" }
  },
  {
    name: "aria-label 和 placeholder 控件",
    url: "https://jobs.example.cn/quick-apply",
    html: `<input aria-label="手机号" /><input placeholder="电子邮箱" /><textarea aria-label="个人优势"></textarea>`,
    expected: ["phone", "email", "selfIntroduction"],
    values: { phone: "13800000000", email: "zhangsan@example.com", selfIntroduction: "善于协作" }
  },
  {
    name: "data-label 和 contenteditable 控件",
    url: "https://ats.example.cn/candidate",
    html: `<div data-label="目标职位"><input /></div><div data-label="自我介绍" contenteditable="true"></div>`,
    expected: ["targetPosition", "selfIntroduction"],
    values: { targetPosition: "前端工程师", selfIntroduction: "负责前端开发" }
  }
] as const;

describe("通用表单引擎夹具", () => {
  it.each(fixtures)("$name 不依赖站点 adapter 也能扫描和填写", async ({ url, html, expected, values }) => {
    document.body.innerHTML = html;
    const engine = createDomEngine(document, url);
    const fields = engine.scan();
    expect(fields.map((field) => field.key)).toEqual(expect.arrayContaining(expected));
    const result = await engine.fill(values, "overwrite");
    expect(result.filled.length).toBeGreaterThanOrEqual(expected.length);
    expect(result.failed).toEqual([]);
  });

  it("不会把包含多个控件的 data-label 容器标题套给每个控件", () => {
    document.body.innerHTML = `<div data-label="工作经历"><input name="company" /><input name="position" /></div>`;
    const fields = createDomEngine(document, "https://unknown.example/apply").scan();
    expect(fields.map((field) => field.key)).toEqual(["company", "position"]);
    expect(fields.every((field) => !field.label.includes("工作经历"))).toBe(true);
  });
});
