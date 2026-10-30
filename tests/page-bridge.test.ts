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

  it("能读出按钮上的 onclick 和 Vue click", () => {
    document.body.innerHTML = `<button class="add_btn">添加 教育背景</button>`;
    const button = document.querySelector("button")!;
    button.onclick = () => undefined;
    (button as HTMLButtonElement & { __vue__?: unknown }).__vue__ = { $listeners: { click: () => undefined } };
    installOfferStarPageBridge(document);
    button.dispatchEvent(new CustomEvent("offer-star-inspect-click", { bubbles: true }));
    expect(button.getAttribute("data-offer-star-click")).toContain("onclick");
    expect(button.getAttribute("data-offer-star-click")).toContain("vue");
  });

  it("能记住所用 addEventListener 挂上的 click，包括父级", () => {
    document.body.innerHTML = `<div class="add_fieldGroup"><button class="add_btn">添加 教育背景</button></div>`;
    installOfferStarPageBridge(document);
    const button = document.querySelector("button")!;
    const parent = document.querySelector("div")!;
    const onButton = () => undefined;
    button.addEventListener("click", onButton);
    button.dispatchEvent(new CustomEvent("offer-star-inspect-click", { bubbles: true }));
    expect(button.getAttribute("data-offer-star-click")).toContain("listener");
    expect(button.getAttribute("data-offer-star-click-at")).toBe("自身");
    button.removeEventListener("click", onButton);
    parent.addEventListener("click", () => undefined);
    button.dispatchEvent(new CustomEvent("offer-star-inspect-click", { bubbles: true }));
    expect(button.getAttribute("data-offer-star-click-at")).toBe("父级 div.add_fieldGroup");
  });

  it("在页面环境里派发按钮点击", () => {
    document.body.innerHTML = `<button class="add_btn">添加 教育背景</button>`;
    installOfferStarPageBridge(document);
    const button = document.querySelector("button")!;
    let clicks = 0;
    button.addEventListener("click", () => { clicks += 1; });
    button.dispatchEvent(new CustomEvent("offer-star-activate", { bubbles: true }));
    expect(clicks).toBe(1);
    expect(button.getAttribute("data-offer-star-activated")).toBe("1");
  });

  it("页面用非对象注册 click 时不会抛出 WeakMap 异常", () => {
    installOfferStarPageBridge(document);
    const detached = EventTarget.prototype.addEventListener;
    let message = "";
    try {
      detached.call(1 as unknown as EventTarget, "click", () => undefined);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message.toLowerCase()).not.toContain("weak map");
  });
});
