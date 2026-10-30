/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createDomEngine } from "../src/content/dom-engine";

describe("填写顺序", () => {
  it("按页面从上到下填写，不按简历字段顺序", async () => {
    document.body.innerHTML = `
      <label>邮箱<input id="email" /></label>
      <label>姓名<input id="name" /></label>
      <label>手机号<input id="phone" /></label>
    `;
    const order: string[] = [];
    for (const id of ["email", "name", "phone"]) {
      document.querySelector(`#${id}`)?.addEventListener("input", () => order.push(id));
    }
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({ name: "测试用户", phone: "13800000000", email: "test@example.com" }, "overwrite");
    expect(order).toEqual(["email", "name", "phone"]);
  });
});
