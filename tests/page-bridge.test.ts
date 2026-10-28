/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { installOfferStarPageBridge } from "../src/content/page-bridge";

describe("页面内 Vue 表单桥接", () => {
  it("把文本交给字段自己的 setFieldsValue", () => {
    document.body.innerHTML = `<input class="ant-input" />`;
    const input = document.querySelector("input")!;
    const seen: unknown[] = [];
    (input as HTMLInputElement & { __vue__?: unknown }).__vue__ = {
      form: { setFieldsValue: (fields: { value: unknown }) => { seen.push(fields.value); } }
    };
    installOfferStarPageBridge(document);
    input.setAttribute("data-offer-star-pending", "测试用户");
    input.dispatchEvent(new CustomEvent("offer-star-commit-field", { bubbles: true }));
    expect(seen).toEqual(["测试用户"]);
    expect(input.getAttribute("data-offer-star-vue")).toBe("ok");
    expect(input.hasAttribute("data-offer-star-pending")).toBe(false);
  });

  it("日期交给页面里的 moment，而不是普通字符串", () => {
    document.body.innerHTML = `<input class="ant-calendar-picker-input" />`;
    const input = document.querySelector("input")!;
    const seen: unknown[] = [];
    (input as HTMLInputElement & { __vue__?: unknown }).__vue__ = {
      form: { setFieldsValue: (fields: { value: unknown }) => { seen.push(fields.value); } }
    };
    (window as Window & { moment?: (input: string) => { _isValid: boolean; formatted: string } }).moment = (value) => ({ _isValid: true, formatted: value });
    installOfferStarPageBridge(document);
    input.setAttribute("data-offer-star-kind", "date");
    input.setAttribute("data-offer-star-pending", "2024-09-01");
    input.dispatchEvent(new CustomEvent("offer-star-commit-field", { bubbles: true }));
    expect(seen).toEqual([{ _isValid: true, formatted: "2024-09-01" }]);
  });
});
