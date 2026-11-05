/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createDomEngine } from "../src/content/dom-engine";

describe("ATS 招聘系统复合表单夹具", () => {
  it("Moka 申请页可以填写搜索型期望城市并按顺序新增工作经历", async () => {
    document.body.innerHTML = `
      <label>期望城市<input role="combobox" aria-label="期望城市" aria-haspopup="listbox" /></label>
      <div id="cities"></div>
      <section id="work">
        <label>公司<input name="company-1" /></label>
        <button type="button" id="add-work">新增工作经历</button>
      </section>
    `;
    const cityInput = document.querySelector<HTMLInputElement>("[role=combobox]")!;
    cityInput.addEventListener("input", () => {
      const list = document.createElement("div");
      list.setAttribute("role", "listbox");
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = "上海";
      option.dataset.value = "上海";
      option.addEventListener("click", () => { cityInput.value = "上海"; });
      list.append(option);
      document.querySelector("#cities")?.replaceChildren(list);
    });
    let additions = 0;
    document.querySelector<HTMLButtonElement>("#add-work")?.addEventListener("click", () => {
      additions += 1;
      const wrapper = document.createElement("label");
      wrapper.textContent = "公司";
      const input = document.createElement("input");
      input.name = `company-${document.querySelectorAll("#work input").length + 1}`;
      wrapper.append(input);
      document.querySelector("#work")?.insertBefore(wrapper, document.querySelector("#add-work")!);
    });

    const engine = createDomEngine(document, "https://app.mokahr.com/apply/blueinteractive/38433");
    const result = await engine.fill({ targetCity: "上海", company: ["甲公司", "乙公司"] }, "overwrite");

    expect(result.failed).toEqual([]);
    expect(cityInput.value).toBe("上海");
    expect(Array.from(document.querySelectorAll<HTMLInputElement>("#work input")).map((input) => input.value)).toEqual(["甲公司", "乙公司"]);
    await engine.fill({ targetCity: "上海", company: ["甲公司", "乙公司"] }, "overwrite");
    expect(document.querySelectorAll("#work input")).toHaveLength(2);
    expect(additions).toBe(1);
  });

  it("北森申请页的动态经历按钮没有新增区块时不会重复点击", async () => {
    document.body.innerHTML = `
      <label>公司<input name="company-1" /></label>
      <button type="button">新增工作经历</button>
    `;
    const engine = createDomEngine(document, "https://beisen.zhiye.com/jobs/1");
    const result = await engine.fill({ company: ["甲公司", "乙公司"] }, "overwrite");

    expect(result.filled).toEqual(["company"]);
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("甲公司");
  });

  it("Moka 级联城市控件会在省份选择后等待并选择城市", async () => {
    document.body.innerHTML = `
      <label>所在城市<input role="combobox" aria-label="所在城市" aria-haspopup="listbox" /></label>
      <label>期望城市<input role="combobox" aria-label="期望城市" aria-haspopup="listbox" /></label>
      <div id="options"></div>
    `;
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("[role=combobox]"));
    inputs[0].addEventListener("input", () => {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.dataset.value = "广东";
      option.textContent = "广东";
      option.addEventListener("click", () => {
        inputs[0].value = "广东";
        inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
      });
      document.querySelector("#options")?.replaceChildren(option);
    });
    inputs[1].addEventListener("input", () => {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.dataset.value = "深圳";
      option.textContent = "深圳";
      option.addEventListener("click", () => { inputs[1].value = "深圳"; });
      document.querySelector("#options")?.replaceChildren(option);
    });

    const engine = createDomEngine(document, "https://app.mokahr.com/apply/blueinteractive/38433");
    const result = await engine.fill({ city: "广东", targetCity: "深圳" }, "overwrite");

    expect(result.failed).toEqual([]);
    expect(inputs.map((input) => input.value)).toEqual(["广东", "深圳"]);
  });

  it("北森 ATS 可以填写附件后进入下一步，但不会点击最终提交", async () => {
    document.body.innerHTML = `
      <section id="step-one">
        <label>姓名<input name="name" /></label>
        <label>简历附件<input type="file" accept="application/pdf" aria-label="简历附件" /></label>
        <button type="button" id="continue">继续填写</button>
        <button type="button" id="submit">提交申请</button>
      </section>
      <section id="step-two" hidden><label>自我介绍<textarea name="description"></textarea></label></section>
    `;
    let submitted = false;
    document.querySelector("#submit")?.addEventListener("click", () => { submitted = true; });
    document.querySelector("#continue")?.addEventListener("click", () => {
      document.querySelector("#step-one")?.setAttribute("hidden", "true");
      document.querySelector("#step-two")?.removeAttribute("hidden");
    });
    const engine = createDomEngine(document, "https://beisen.zhiye.com/jobs/1");
    const fillResult = await engine.fill({ name: "张三" }, "overwrite");
    const fileResult = await engine.fillFiles([{ dataUrl: "data:application/pdf;base64,JVBERg==", fileName: "简历.pdf", mimeType: "application/pdf" }]);
    const stepResult = await engine.advanceStep();

    expect(fillResult.failed).toEqual([]);
    expect(fileResult).toMatchObject({ filled: true, count: 1, failed: [] });
    expect(stepResult).toEqual({ advanced: true, label: "继续填写" });
    expect(document.querySelector<HTMLInputElement>("input[type=file]")?.files?.[0]?.name).toBe("简历.pdf");
    expect(document.querySelector("#step-two")?.hasAttribute("hidden")).toBe(false);
    expect(submitted).toBe(false);
  });
});
