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

  it("多层包裹时仍按开始年、开始月、结束年填写，结束为至今时不填结束月", async () => {
    document.body.innerHTML = `
      <div class="apply-field-x date_info-x">
        <div class="title"><span><span>就读时间</span></span></div>
        <div class="ctrl"><div class="month-range-select">
          <span>
            <div class="item"><div class="sd-Tooltip"><div class="sd-Dropdown"><label class="sd-Select"><input id="sy" placeholder="年" /><ul id="sy-menu" style="display:none"><li>2025</li><li>至今</li></ul></label></div></div></div>
            <div class="item"><div class="sd-Tooltip"><div class="sd-Dropdown"><label class="sd-Select"><input id="sm" placeholder="月" /><ul id="sm-menu" style="display:none"><li>1</li><li>8</li></ul></label></div></div></div>
          </span>
          <span class="till">-</span>
          <span>
            <div class="item"><div class="sd-Dropdown"><label class="sd-Select"><input id="ey" placeholder="年" /><ul id="ey-menu" style="display:none"><li>2025</li><li>至今</li></ul></label></div></div></div>
            <div class="item"><div class="sd-Dropdown"><label class="sd-Select"><input id="em" placeholder="月" /><ul id="em-menu" style="display:none"><li>1</li><li>8</li></ul></label></div></div></div>
          </span>
        </div></div>
      </div>
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
    await engine.fill({ educationStartDate: ["2025-08", "2020-09"], educationEndDate: ["Present", "2024-06"] }, "overwrite");
    expect(document.querySelector<HTMLInputElement>("#sy")?.value).toBe("2025");
    expect(document.querySelector<HTMLInputElement>("#sm")?.value).toBe("8");
    expect(document.querySelector<HTMLInputElement>("#ey")?.value).toBe("至今");
    expect(document.querySelector<HTMLInputElement>("#em")?.value).toBe("");
  });

  it("时间下拉要点中带哈希类名的 Sugar 菜单行，不能只把年份写进输入框", async () => {
    document.body.innerHTML = `
      <div class="apply-field-x">
        <div class="title"><span>就读时间</span></div>
        <div class="month-range-select">
          <div class="sd-Dropdown-container-1CigZ">
            <label class="sd-Select-container-1Eq4x sd-Input-error-_Z3Qd">
              <span class="sd-Input-display-value-RwqDy"><span>2025</span></span>
              <input id="sy" placeholder="" value="" />
            </label>
            <span><div class="sd-Dropdown-dropdown-GmACl" id="sy-menu" style="display:none"><div class="sd-Select-scrollable-6CVW5"><div class="sd-Menu-container-1WISQ"><span data-key="sugar.select.label">2025</span></div><div class="sd-Menu-container-1WISQ"><span data-key="sugar.select.label">2020</span></div></div></div></span>
          </div>
          <div class="sd-Dropdown-container-1CigZ">
            <label class="sd-Select-container-1Eq4x"><input id="sm" placeholder="月" /></label>
            <span><div class="sd-Dropdown-dropdown-GmACl" id="sm-menu" style="display:none"><div class="sd-Menu-container-1WISQ"><span data-key="sugar.select.label">8</span></div></div></span>
          </div>
          <div class="sd-Dropdown-container-1CigZ">
            <label class="sd-Select-container-1Eq4x"><input id="ey" placeholder="年" /></label>
            <span><div class="sd-Dropdown-dropdown-GmACl" id="ey-menu" style="display:none"><div class="sd-Menu-container-1WISQ"><span data-key="sugar.select.label">至今</span></div></div></span>
          </div>
          <div class="sd-Dropdown-container-1CigZ">
            <label class="sd-Select-container-1Eq4x"><input id="em" placeholder="月" /></label>
          </div>
        </div>
      </div>
    `;
    for (const id of ["sy", "sm", "ey"]) {
      const input = document.querySelector<HTMLInputElement>(`#${id}`)!;
      const menu = document.querySelector<HTMLElement>(`#${id}-menu`)!;
      input.addEventListener("click", () => { menu.style.display = "block"; });
      menu.querySelectorAll("[class*='sd-Menu-container']").forEach((item) => item.addEventListener("mousedown", () => {
        input.dataset.committed = item.textContent ?? "";
        menu.style.display = "none";
      }));
    }
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({ educationStartDate: "2025-08", educationEndDate: "Present" }, "overwrite");
    expect(document.querySelector<HTMLInputElement>("#sy")?.dataset.committed).toBe("2025");
    expect(document.querySelector<HTMLInputElement>("#sm")?.dataset.committed).toBe("8");
    expect(document.querySelector<HTMLInputElement>("#ey")?.dataset.committed).toBe("至今");
    expect(document.querySelector<HTMLInputElement>("#sy")?.value ?? "").toBe("");
  });

  it("第一段教育写完后，再点添加并填上第二段", async () => {
    const block = () => `
      <div class="edu">
        <div>学校名称</div><input class="school" />
        <div>专业名称</div><input class="major" />
        <div>学历</div><input class="degree" />
        <div><span>就读时间</span></div>
        <div class="month-range-select">
          <input class="sy" placeholder="年" /><ul hidden><li>2025</li><li>2020</li><li>至今</li></ul>
          <input class="sm" placeholder="月" /><ul hidden><li>8</li><li>9</li></ul>
          <input class="ey" placeholder="年" /><ul hidden><li>2024</li><li>至今</li></ul>
          <input class="em" placeholder="月" /><ul hidden><li>6</li><li>9</li></ul>
        </div>
      </div>
    `;
    document.body.innerHTML = `
      <div class="blockTitle"><span>教育背景</span><button type="button" id="add-edu">添加</button></div>
      <div id="list">${block()}</div>
    `;
    const bindDates = (scope: ParentNode) => {
      scope.querySelectorAll<HTMLInputElement>("input.sy, input.sm, input.ey, input.em").forEach((input) => {
        if (input.dataset.bound) return;
        input.dataset.bound = "1";
        const menu = input.nextElementSibling;
        if (!(menu instanceof HTMLElement)) return;
        input.addEventListener("click", () => { menu.hidden = false; });
        menu.querySelectorAll("li").forEach((item) => item.addEventListener("click", () => {
          input.value = item.textContent ?? "";
          menu.hidden = true;
        }));
      });
    };
    bindDates(document);
    document.querySelector("#add-edu")?.addEventListener("click", () => {
      const firstSchool = document.querySelector<HTMLInputElement>(".school");
      if (!firstSchool?.value || document.querySelectorAll(".edu").length >= 2) return;
      document.querySelector("#list")?.insertAdjacentHTML("beforeend", block());
      const list = document.querySelector("#list");
      if (list) bindDates(list);
    });
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({
      school: ["甲大学", "乙大学"],
      major: ["数据科学", "大数据管理"],
      degree: ["硕士", "本科"],
      educationStartDate: ["2025-08", "2020-09"],
      educationEndDate: ["Present", "2024-06"]
    }, "overwrite");
    const valueOf = (selector: string) => Array.from(document.querySelectorAll<HTMLInputElement>(selector)).map((item) => item.value);
    expect(valueOf(".school")).toEqual(["甲大学", "乙大学"]);
    expect(valueOf(".major")).toEqual(["数据科学", "大数据管理"]);
    expect(valueOf(".degree")).toEqual(["硕士", "本科"]);
    expect(valueOf(".sy")).toEqual(["2025", "2020"]);
    expect(valueOf(".sm")).toEqual(["8", "9"]);
    expect(valueOf(".ey")).toEqual(["至今", "2024"]);
    expect(valueOf(".em")).toEqual(["", "6"]);
  });
});
