/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { createDomEngine } from "../src/content/dom-engine";
import { createRegionSelector, isInsideRegion } from "../src/content/region-selection";
const url = "https://campus.example.com/apply";
const input = (id: string) => document.getElementById(id) as HTMLInputElement;

describe("补空白和选区填写边界", () => {
  it("重新检测新增输入，保留手填、下拉和单选内容，不点添加、确认和提交", async () => {
    document.body.innerHTML = `<label>姓名<input id="name" value="手填姓名"></label><label>现居城市<select id="city"><option>北京</option><option>上海</option></select></label><fieldset><legend>学历</legend><label>本科<input type="radio" name="degree" value="本科" checked></label><label>硕士<input type="radio" name="degree" value="硕士"></label></fieldset><div class="blockTitle"><span>实习经历</span><button type="button">添加</button></div><div class="edit_mode"><button type="button">确认</button></div><button type="submit">提交</button>`;
    const click = vi.fn(); document.querySelectorAll("button").forEach((button) => button.addEventListener("click", click));
    const engine = createDomEngine(document, url); engine.scan();
    document.body.insertAdjacentHTML("beforeend", '<div><span>邮箱</span><input id="email" type="email"></div>');
    const result = await engine.fill({ name: "简历姓名", email: "fixture@example.com", city: "上海", degree: "硕士", company: ["甲", "乙"] }, "incremental", { existingOnly: true });
    expect(input("name").value).toBe("手填姓名"); expect(input("city").value).toBe("北京");
    expect(document.querySelector<HTMLInputElement>('input[value="本科"]')!.checked).toBe(true);
    expect(input("email").value).toBe("fixture@example.com"); expect(result.filled).toEqual(["email"]); expect(click).not.toHaveBeenCalled();
  });
  it("只填所选控件，保留重复经历原序号，不写区域外同名字段", async () => {
    document.body.innerHTML = `<div><label>学校<input id="first"></label></div><div><label>学校<input id="second"></label></div><label>邮箱<input id="email"></label>`;
    const engine = createDomEngine(document, url);
    const scope = new Set([input("second")]);
    await engine.fill({ school: ["甲大学", "乙大学"], email: "fixture@example.com" }, "incremental", { scope, existingOnly: true });
    expect(input("first").value).toBe(""); expect(input("second").value).toBe("乙大学"); expect(input("email").value).toBe("");
    input("second").outerHTML = '<input id="second">';
    await engine.fill({ school: ["甲大学", "乙大学"] }, "incremental", { scope });
    expect(input("second").value).toBe("");
  });
  it("拆分日期保留已有年，只填写选中的空白月，不改区域外年月", async () => {
    document.body.innerHTML = `<div><div>就读时间</div><div><input id="sy" placeholder="年" value="2019" readonly><input id="sm" placeholder="月" readonly><ul hidden><li>9</li></ul><input id="ey" placeholder="年" readonly><input id="em" placeholder="月" readonly></div></div>`;
    const month = input("sm"), menu = month.nextElementSibling as HTMLElement;
    month.addEventListener("click", () => { menu.hidden = false; });
    menu.querySelector("li")!.addEventListener("click", () => { month.value = "9"; menu.hidden = true; });
    const engine = createDomEngine(document, url);
    const result = await engine.fill({ educationStartDate: "2020-09", educationEndDate: "2024-06" }, "incremental", { scope: new Set([input("sy"), month]), existingOnly: true });
    expect(input("sy").value).toBe("2019"); expect(month.value).toBe("9"); expect(input("ey").value).toBe(""); expect(input("em").value).toBe(""); expect(result.filled).toContain("educationStartDate");
  });
  it("选区用中心坐标判断，取消清除覆盖层，不触发填写", async () => {
    document.body.innerHTML = '<input id="name" aria-label="姓名">';
    vi.spyOn(input("name"), "getBoundingClientRect").mockReturnValue({ left: 20, top: 40, width: 100, height: 30 } as DOMRect);
    expect(isInsideRegion(input("name"), { left: 10, top: 30, right: 80, bottom: 80 })).toBe(true);
    expect(isInsideRegion(input("name"), { left: 10, top: 30, right: 40, bottom: 80 })).toBe(false);
    const selector = createRegionSelector(document); const pending = selector.select();
    expect(document.querySelector("#offer-star-region-selector")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await pending).toBeNull(); expect(document.querySelector("#offer-star-region-selector")).toBeNull(); expect(input("name").value).toBe("");
  });
});
