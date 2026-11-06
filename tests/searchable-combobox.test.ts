/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { createDomEngine } from "../src/content/dom-engine";

describe("可搜索下拉框", () => {
  it("先输入搜索值，再选择动态出现的候选项", async () => {
    document.body.innerHTML = `
      <label>应聘职位<input role="combobox" aria-haspopup="listbox" /></label>
      <div id="options"></div>
    `;
    const input = document.querySelector<HTMLInputElement>("[role=combobox]")!;
    const options = document.querySelector<HTMLElement>("#options")!;
    input.addEventListener("input", () => {
      options.innerHTML = `<div role="option" data-value="产品经理">产品经理</div>`;
      options.firstElementChild?.addEventListener("click", () => { input.dataset.value = "产品经理"; });
    });
    const engine = createDomEngine(document, "https://www.zhipin.com/job/1");
    const result = await engine.fill({ targetPosition: "产品经理" }, "overwrite");
    expect(result.filled).toEqual(["targetPosition"]);
    expect(input.dataset.value).toBe("产品经理");
  });

  it("不会点击隐藏的同名候选项", async () => {
    document.body.innerHTML = '<label>应聘职位<input role="combobox" aria-haspopup="listbox" /></label><div role="option" data-value="产品经理" hidden>产品经理</div>';
    const optionClick = vi.fn();
    document.querySelector("[role=option]")!.addEventListener("click", optionClick);
    const engine = createDomEngine(document, "https://www.zhipin.com/job/1");
    const result = await engine.fill({ targetPosition: "产品经理" }, "overwrite");
    expect(document.querySelector<HTMLInputElement>("input")!.value).toBe("");
    expect(optionClick).not.toHaveBeenCalled();
    expect(result.failed).toEqual(["targetPosition"]);
    expect(result.failureReasons.targetPosition).toBe("控件不支持该值或候选项未匹配");
  });
  it("搜索未匹配时恢复原有内容，再次填写仍返回失败而不是跳过", async () => {
    document.body.innerHTML = '<label>应聘职位<input role="combobox" aria-haspopup="listbox" value="原有职位" /></label>';
    const engine = createDomEngine(document, "https://example.com/apply");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await engine.fill({ targetPosition: "不存在的职位" }, "overwrite");
      expect(result.failed).toEqual(["targetPosition"]);
      expect(result.filled).toEqual([]);
      expect(document.querySelector<HTMLInputElement>("input")!.value).toBe("原有职位");
    }
  });

});
