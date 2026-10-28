/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { installFormMutationObserver } from "../src/shared/form-mutation-observer";

describe("表单结构变化监听", () => {
  it("异步新增控件时通知一次", async () => {
    document.body.innerHTML = `<form><input name="name" /></form>`;
    let count = 0;
    const cleanup = installFormMutationObserver(document, () => { count += 1; }, () => false, 10);
    const input = document.createElement("input");
    input.name = "email";
    document.querySelector("form")?.append(input);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(count).toBe(1);
    cleanup();
  });

  it("下拉菜单和注释节点不触发重新扫描", async () => {
    document.body.innerHTML = `<form><input name="name" /></form>`;
    let count = 0;
    const cleanup = installFormMutationObserver(document, () => { count += 1; }, () => false, 10);
    const dropdown = document.createElement("div");
    dropdown.className = "ant-select-dropdown";
    dropdown.append(document.createElement("ul"));
    document.body.append(dropdown);
    document.body.append(document.createComment(""));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(count).toBe(0);
    cleanup();
  });

  it("抑制开始后取消已经排队的通知", async () => {
    document.body.innerHTML = `<form><input name="name" /></form>`;
    let suppressed = false;
    let count = 0;
    const cleanup = installFormMutationObserver(document, () => { count += 1; }, () => suppressed, 40);
    document.querySelector("form")?.append(document.createElement("input"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    suppressed = true;
    document.querySelector("form")?.append(document.createElement("input"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    suppressed = false;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(count).toBe(0);
    document.querySelector("form")?.append(document.createElement("input"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(count).toBe(1);
    cleanup();
  });

  it("抑制期间不通知，清理后也不再通知", async () => {
    document.body.innerHTML = `<form><input name="name" /></form>`;
    let suppressed = true;
    let count = 0;
    const cleanup = installFormMutationObserver(document, () => { count += 1; }, () => suppressed, 10);
    document.querySelector("form")?.append(document.createElement("input"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(count).toBe(0);
    suppressed = false;
    cleanup();
    document.querySelector("form")?.append(document.createElement("input"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(count).toBe(0);
  });
});
