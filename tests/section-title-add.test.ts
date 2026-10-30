/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createDomEngine } from "../src/content/dom-engine";

describe("区块标题旁的添加按钮和年月下拉", () => {
  it("点击标题旁边只写着添加的按钮", async () => {
    document.body.innerHTML = `
      <div class="blockTitle">
        <div>
          <span><span>实习经历</span></span>
          <button type="button" id="add-intern"><span class="icon"></span><span>添加</span></button>
        </div>
      </div>
      <div class="blockTitle">
        <div>
          <span><span>教育背景</span></span>
          <button type="button" id="add-edu"><span>添加</span></button>
        </div>
      </div>
    `;
    let intern = 0;
    let edu = 0;
    document.querySelector("#add-intern")?.addEventListener("click", () => { intern += 1; });
    document.querySelector("#add-edu")?.addEventListener("click", () => { edu += 1; });
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({ company: "示例公司", school: "示例大学" }, "overwrite");
    expect(intern).toBeGreaterThan(0);
    expect(edu).toBeGreaterThan(0);
  });

  it("把就读时间拆成开始和结束的年、月", async () => {
    document.body.innerHTML = `
      <div><div>就读时间 *</div><div>
        <input id="sy" placeholder="年" readonly /><ul id="sy-menu" style="display:none"><li>2020</li><li>2024</li></ul>
        <input id="sm" placeholder="月" readonly /><ul id="sm-menu" style="display:none"><li>9</li><li>6</li></ul>
        <input id="ey" placeholder="年" readonly /><ul id="ey-menu" style="display:none"><li>2020</li><li>2024</li></ul>
        <input id="em" placeholder="月" readonly /><ul id="em-menu" style="display:none"><li>9</li><li>6</li></ul>
      </div></div>
    `;
    for (const id of ["sy", "sm", "ey", "em"]) {
      const input = document.querySelector<HTMLInputElement>(`#${id}`)!;
      const menu = document.querySelector<HTMLElement>(`#${id}-menu`)!;
      input.addEventListener("click", () => { menu.style.display = "block"; });
      menu.querySelectorAll("li").forEach((item) => item.addEventListener("click", () => {
        input.value = item.textContent ?? "";
        menu.style.display = "none";
      }));
    }
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({ educationStartDate: "2020-09", educationEndDate: "2024-06" }, "overwrite");
    expect(document.querySelector<HTMLInputElement>("#sy")?.value).toBe("2020");
    expect(document.querySelector<HTMLInputElement>("#sm")?.value).toBe("9");
    expect(document.querySelector<HTMLInputElement>("#ey")?.value).toBe("2024");
    expect(document.querySelector<HTMLInputElement>("#em")?.value).toBe("6");
  });
});
