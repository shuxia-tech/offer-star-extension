/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createDomEngine } from "../src/content/dom-engine";
import { canonicalDegree, choiceCandidates } from "../src/shared/fill-values";

describe("请选择下拉", () => {
  it("识别性别和最高学历，并点中下拉里的原词", async () => {
    document.body.innerHTML = `
      <div><div>性别 <span>*</span></div><div><input id="gender" placeholder="请选择" readonly /><ul id="gender-menu" style="display:none"><li>男</li><li>女</li></ul></div></div>
      <div><div>最高学历 <span>*</span></div><div><input id="degree" placeholder="请选择" readonly /><ul id="degree-menu" style="display:none"><li>本科</li><li>硕士</li><li>博士</li><li>高中</li><li>大专</li><li>中专</li><li>初中及以下</li><li>MBA</li><li>其他</li></ul></div></div>
    `;
    const gender = document.querySelector<HTMLInputElement>("#gender")!;
    const degree = document.querySelector<HTMLInputElement>("#degree")!;
    const genderMenu = document.querySelector<HTMLElement>("#gender-menu")!;
    const degreeMenu = document.querySelector<HTMLElement>("#degree-menu")!;
    gender.addEventListener("click", () => { genderMenu.style.display = "block"; });
    degree.addEventListener("click", () => { degreeMenu.style.display = "block"; });
    genderMenu.querySelectorAll("li").forEach((item) => item.addEventListener("click", () => { gender.value = item.textContent ?? ""; genderMenu.style.display = "none"; }));
    degreeMenu.querySelectorAll("li").forEach((item) => item.addEventListener("click", () => { degree.value = item.textContent ?? ""; degreeMenu.style.display = "none"; }));
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    expect(engine.scan().map((field) => field.key)).toEqual(["gender", "highestDegree"]);
    const result = await engine.fill({ gender: "女", highestDegree: "硕士" }, "overwrite");
    expect(gender.value).toBe("女");
    expect(degree.value).toBe("硕士");
    expect(result.failed).toEqual([]);
  });

  it("把简历学历收成页面上的完整选项", () => {
    expect(canonicalDegree("工商管理硕士")).toBe("MBA");
    expect(canonicalDegree("初中")).toBe("初中及以下");
    expect(choiceCandidates("硕士")).toEqual(expect.arrayContaining(["硕士", "硕士研究生"]));
    expect(choiceCandidates("硕士")).not.toContain("其他");
  });
});
