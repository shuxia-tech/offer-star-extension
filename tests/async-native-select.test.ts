/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createDomEngine } from "../src/content/dom-engine";

describe("异步原生下拉框", () => {
  it("option 延迟插入后仍能完成填写", async () => {
    document.body.innerHTML = '<label>期望城市<select name="city"><option value="">请选择</option></select></label>';
    const select = document.querySelector("select")!;
    setTimeout(() => select.insertAdjacentHTML("beforeend", '<option value="bj">北京</option>'), 5);

    const engine = createDomEngine(document, "https://example.com/apply");
    const result = await engine.fill({ targetCity: "北京" }, "overwrite");
    expect(result.failed).toEqual([]);
    expect((select as HTMLSelectElement).value).toBe("bj");
  });

  it("候选项始终不存在时有限等待后返回可定位原因", async () => {
    document.body.innerHTML = '<label>期望城市<select name="city"><option value="">请选择</option></select></label>';
    const engine = createDomEngine(document, "https://example.com/apply");
    const result = await engine.fill({ targetCity: "不存在" }, "overwrite");
    expect(result.failed).toEqual(["targetCity"]);
    expect(result.failureReasons.targetCity).toBe("控件不支持该值或候选项未匹配");
  });

  it("手机号旁的原生 select 区号被识别为国家区号，不抢占手机号字段", async () => {
    document.body.innerHTML = `
      <div><label>手机号</label>
        <select name="country"><option value="+86">+86</option><option value="+1">+1</option></select>
        <input name="phone" placeholder="请输入手机号" />
      </div>
    `;
    const engine = createDomEngine(document, "https://example.com/apply");
    const fields = engine.scan();
    // 区号 select 不能作为 phone 字段出现，手机号 input 才是 phone。
    expect(fields.filter((field) => field.key === "phone")).toHaveLength(1);
    expect(fields.find((field) => field.key === "phone")?.type).toBe("input");
    const result = await engine.fill({ phone: "13800000000" }, "overwrite");
    expect(result.failed).toEqual([]);
    expect(document.querySelector<HTMLInputElement>("[name=phone]")?.value).toBe("13800000000");
    // 区号保持原样，不被错误改写。
    expect(document.querySelector<HTMLSelectElement>("[name=country]")?.value).toBe("+86");
  });

  it("区号输入框显示 +86 时不写入，手机号写到旁边的号码框", async () => {
    document.body.innerHTML = `
      <div class="apply-field">
        <div class="title"><span>手机号码</span></div>
        <div class="ctrl">
          <div class="code-area">
            <label class="sd-Select">
              <span class="sd-Input-display-value"><span>+86</span></span>
              <input type="text" class="country-input" placeholder="" value="">
            </label>
          </div>
          <div class="number-area">
            <label><input type="text" class="phone-input" placeholder="请输入手机号" value=""></label>
          </div>
        </div>
      </div>
    `;
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    const phones = engine.scan().filter((field) => field.key === "phone");
    expect(phones).toHaveLength(1);
    expect(phones[0]?.label).toContain("手机号码");
    const result = await engine.fill({ phone: "13800000000" }, "overwrite");
    expect(result.failed).toEqual([]);
    expect(document.querySelector<HTMLInputElement>(".phone-input")?.value).toBe("13800000000");
    expect(document.querySelector<HTMLInputElement>(".country-input")?.value).toBe("");
    expect(document.querySelector(".country-input")?.getAttribute("data-offer-star-autofill-used") ?? "").toBe("");
  });

  it("性别和最高学历的文字选项能点中，手机号输入框不被下拉逻辑改掉", async () => {
    document.body.innerHTML = `
      <div><div>手机号</div><div><input id="phone" placeholder="请输入手机号" /></div></div>
      <div><div>性别 *</div><div><input id="gender" placeholder="请选择" readonly /><div class="menu" style="display:none"><div class="option">男</div><div class="option">女</div></div></div></div>
      <div><div>最高学历 *</div><div><input id="degree" placeholder="请选择" readonly /><div class="menu" style="display:none"><div class="option">本科</div><div class="option">硕士</div><div class="option">博士</div></div></div></div>
    `;
    for (const id of ["gender", "degree"]) {
      const input = document.querySelector<HTMLInputElement>(`#${id}`)!;
      const menu = input.parentElement?.querySelector<HTMLElement>(".menu");
      input.addEventListener("click", () => { if (menu) menu.style.display = "block"; });
      menu?.querySelectorAll(".option").forEach((item) => item.addEventListener("click", () => { input.value = item.textContent ?? ""; }));
    }
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    const result = await engine.fill({ phone: "13800000000", gender: "女", highestDegree: "硕士" }, "overwrite");
    expect(document.querySelector<HTMLInputElement>("#phone")?.value).toBe("13800000000");
    expect(document.querySelector<HTMLInputElement>("#gender")?.value).toBe("女");
    expect(document.querySelector<HTMLInputElement>("#degree")?.value).toBe("硕士");
    expect(result.failed).not.toEqual(expect.arrayContaining(["phone", "gender", "highestDegree"]));
  });
});
