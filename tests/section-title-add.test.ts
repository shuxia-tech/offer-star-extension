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

  it("结束时间为至今时，结束年、月填当天", async () => {
    const today = new Date();
    const year = String(today.getFullYear());
    const month = String(today.getMonth() + 1);
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
            <div class="item"><div class="sd-Dropdown"><label class="sd-Select"><input id="ey" placeholder="年" /><ul id="ey-menu" style="display:none"><li>2025</li><li>${year}</li></ul></label></div></div></div>
            <div class="item"><div class="sd-Dropdown"><label class="sd-Select"><input id="em" placeholder="月" /><ul id="em-menu" style="display:none"><li>1</li><li>${month}</li></ul></label></div></div></div>
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
    expect(document.querySelector<HTMLInputElement>("#ey")?.value).toBe(year);
    expect(document.querySelector<HTMLInputElement>("#em")?.value).toBe(month);
  });

  it("时间下拉要点中带哈希类名的 Sugar 菜单行，不能只把年份写进输入框", async () => {
    const today = new Date();
    const year = String(today.getFullYear());
    const month = String(today.getMonth() + 1);
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
            <span><div class="sd-Dropdown-dropdown-GmACl" id="ey-menu" style="display:none"><div class="sd-Menu-container-1WISQ"><span data-key="sugar.select.label">${year}</span></div></div></span>
          </div>
          <div class="sd-Dropdown-container-1CigZ">
            <label class="sd-Select-container-1Eq4x"><input id="em" placeholder="月" /></label>
            <span><div class="sd-Dropdown-dropdown-GmACl" id="em-menu" style="display:none"><div class="sd-Menu-container-1WISQ"><span data-key="sugar.select.label">${month}</span></div></div></span>
          </div>
        </div>
      </div>
    `;
    for (const id of ["sy", "sm", "ey", "em"]) {
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
    expect(document.querySelector<HTMLInputElement>("#ey")?.dataset.committed).toBe(year);
    expect(document.querySelector<HTMLInputElement>("#em")?.dataset.committed).toBe(month);
    expect(document.querySelector<HTMLInputElement>("#sy")?.value ?? "").toBe("");
  });

  it("年份列表只渲染远处的年份时，先输入年份再点中对应行", async () => {
    document.body.innerHTML = `
      <div class="apply-field-x">
        <div class="title"><span>项目时间</span></div>
        <div class="month-range-select">
          <div class="sd-Dropdown-container-1CigZ">
            <label class="sd-Select-container-1Eq4x"><input id="sy" placeholder="年" value="" /></label>
            <div class="sd-Dropdown-dropdown-GmACl" id="sy-menu" style="display:none"><div class="sd-Select-scrollable-6CVW5"><div class="sd-Menu-container-1WISQ" id="far"><span data-key="sugar.select.label">2126</span></div></div></div>
          </div>
          <div class="sd-Dropdown-container-1CigZ">
            <label class="sd-Select-container-1Eq4x"><input id="sm" placeholder="月" value="" /></label>
            <div class="sd-Dropdown-dropdown-GmACl" id="sm-menu" style="display:none"><div class="sd-Menu-container-1WISQ" id="month"><span data-key="sugar.select.label">3</span></div></div></div>
          </div>
          <span>-</span>
          <label><input id="till" type="checkbox" />至今</label>
        </div>
      </div>
    `;
    const year = document.querySelector<HTMLInputElement>("#sy")!;
    const yearMenu = document.querySelector<HTMLElement>("#sy-menu")!;
    year.addEventListener("click", () => { yearMenu.style.display = "block"; });
    year.addEventListener("input", () => {
      if (year.value !== "2020") return;
      yearMenu.style.display = "block";
      yearMenu.innerHTML = `<div class="sd-Select-scrollable-6CVW5"><div class="sd-Menu-container-1WISQ" id="hit"><span data-key="sugar.select.label">2020</span></div></div>`;
      document.querySelector("#hit")!.addEventListener("mousedown", () => { year.dataset.committed = "2020"; });
    });
    const month = document.querySelector<HTMLInputElement>("#sm")!;
    const monthMenu = document.querySelector<HTMLElement>("#sm-menu")!;
    month.addEventListener("click", () => { monthMenu.style.display = "block"; });
    document.querySelector("#month")!.addEventListener("mousedown", () => { month.dataset.committed = "3"; });
    document.querySelector("#till")!.addEventListener("click", (event) => {
      const box = event.currentTarget as HTMLInputElement;
      box.checked = true;
    });
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({ projectStartDate: "2020-03", projectEndDate: "Present" }, "overwrite");
    expect(year.dataset.committed).toBe("2020");
    expect(month.dataset.committed).toBe("3");
    expect(document.querySelector<HTMLInputElement>("#till")?.checked).toBe(true);
  });

  it("就读学校要先输入校名，等选项出现后再点中，不能只写进输入框", async () => {
    document.body.innerHTML = `
      <div class="apply-field-Q2iJ7AtQGX string_info-UOJxKN5mtC">
        <div class="label"><span>学校名称</span></div>
        <div class="ctrl-CICMG4Fr4_">
          <div class="sd-Dropdown-container-1CigZ">
            <label class="sd-Input-container-2S_vM sd-Select-container-1Eq4x sd-Input-lg-3X8ma">
              <input id="school" class="sd-Input-input-10L0t sd-Input-common-input-1XimE" placeholder="请输入就读学校" autocomplete="nope" value="" />
            </label>
            <div class="sd-Dropdown-dropdown-GmACl" id="school-menu" style="display:none">
              <div class="sd-Select-menu-36GwS">
                <div class="sd-Select-scrollable-6CVW5">
                  <div class="sd-Select-common-item-3YCIH"><div class="sd-Menu-container-1WISQ"><div class="sd-Menu-content-bDquM"><div class="sd-Menu-content-item-3BOO1"><div>另一大学</div></div></div></div></div>
                  <div class="sd-Select-common-item-3YCIH"><div class="sd-Menu-container-1WISQ" id="hit"><div class="sd-Menu-content-bDquM"><div class="sd-Menu-content-item-3BOO1"><div>示例大学</div><div class="sd-Menu-sub-title-3OIiR"></div></div></div></div></div>
                  <div class="sd-Select-common-item-3YCIH"><div class="sd-Menu-container-1WISQ"><div class="sd-Menu-content-bDquM"><div class="sd-Menu-content-item-3BOO1"><div>示例大学南方学院</div></div></div></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const input = document.querySelector<HTMLInputElement>("#school")!;
    const menu = document.querySelector<HTMLElement>("#school-menu")!;
    input.addEventListener("click", () => { input.dataset.opened = "1"; });
    input.addEventListener("input", () => { menu.style.display = input.value === "示例大学" ? "block" : "none"; });
    document.querySelector("#hit")!.addEventListener("mousedown", () => { input.dataset.committed = "示例大学"; });
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({ school: "示例大学" }, "overwrite");
    expect(input.dataset.opened).toBe("1");
    expect(input.dataset.committed).toBe("示例大学");
  });

  it("简历校名带校区括号时，点目录里去掉括号后的那一所", async () => {
    document.body.innerHTML = `
      <div class="apply-field-Q2iJ7AtQGX string_info-UOJxKN5mtC">
        <div class="label"><span>学校名称</span></div>
        <div class="ctrl-CICMG4Fr4_">
          <div class="sd-Dropdown-container-1CigZ">
            <label class="sd-Select-container-1Eq4x">
              <input id="school" placeholder="请输入就读学校" value="" />
            </label>
            <div class="sd-Dropdown-dropdown-GmACl" id="school-menu" style="display:none">
              <div class="sd-Select-menu-36GwS">
                <div class="sd-Menu-container-1WISQ" id="short"><div class="sd-Menu-content-item-3BOO1"><div>香港</div></div></div>
                <div class="sd-Menu-container-1WISQ" id="other"><div class="sd-Menu-content-item-3BOO1"><div>香港大学</div></div></div>
                <div class="sd-Menu-container-1WISQ" id="hit"><div class="sd-Menu-content-item-3BOO1"><div>香港城市大学</div></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const input = document.querySelector<HTMLInputElement>("#school")!;
    const menu = document.querySelector<HTMLElement>("#school-menu")!;
    input.addEventListener("input", () => { menu.style.display = input.value.includes("香港城市大学") ? "block" : "none"; });
    for (const id of ["short", "other", "hit"]) {
      document.querySelector(`#${id}`)!.addEventListener("mousedown", () => { input.dataset.committed = id; });
    }
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({ school: "香港城市大学（东莞）" }, "overwrite");
    expect(input.dataset.committed).toBe("hit");
  });

  it("学校已经选中后，再添加下一段时不会重新聚焦这段学校", async () => {
    document.body.innerHTML = `
      <div class="blockTitle"><span>教育背景</span><button type="button" id="add-edu">添加</button></div>
      <div id="list">
        <div class="edu">
          <div>学校名称</div>
          <label class="sd-Select-container-1Eq4x">
            <span class="sd-Input-display-value-RwqDy"><span></span></span>
            <input class="school first" placeholder="请输入就读学校" value="" />
          </label>
          <div class="sd-Dropdown-dropdown-GmACl" id="school-menu" style="display:none">
            <div class="sd-Menu-container-1WISQ" id="hit"><div class="sd-Menu-content-item-3BOO1"><div>香港城市大学</div></div></div>
          </div>
        </div>
      </div>
    `;
    const input = document.querySelector<HTMLInputElement>(".first")!;
    const menu = document.querySelector<HTMLElement>("#school-menu")!;
    const display = document.querySelector<HTMLElement>(".sd-Input-display-value-RwqDy span")!;
    input.addEventListener("input", () => { menu.style.display = input.value.includes("香港城市大学") ? "block" : "none"; });
    input.addEventListener("mousedown", () => { if (input.dataset.committed) input.dataset.refocused = "1"; });
    document.querySelector("#hit")!.addEventListener("mousedown", () => {
      input.dataset.committed = "1";
      display.textContent = "香港城市大学";
      input.placeholder = "";
      input.value = "";
      menu.style.display = "none";
    });
    document.querySelector("#add-edu")?.addEventListener("click", () => {
      if (!input.dataset.committed || document.querySelectorAll(".school").length >= 2) return;
      document.querySelector("#list")?.insertAdjacentHTML("beforeend", `<div class="edu"><div>学校名称</div><input class="school second" /></div>`);
    });
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({ school: ["香港城市大学（东莞）", "乙大学"] }, "incremental");
    expect(input.dataset.committed).toBe("1");
    expect(input.dataset.refocused).toBeUndefined();
    expect(document.querySelector<HTMLInputElement>(".second")?.value).toBe("乙大学");
  });

  it("第一段教育写完后，再点添加并填上第二段", async () => {
    const today = new Date();
    const year = String(today.getFullYear());
    const month = String(today.getMonth() + 1);
    const block = () => `
      <div class="edu">
        <div>学校名称</div><input class="school" />
        <div>专业名称</div><input class="major" />
        <div>学历</div><input class="degree" />
        <div><span>就读时间</span></div>
        <div class="month-range-select">
          <input class="sy" placeholder="年" /><ul hidden><li>2025</li><li>2020</li><li>至今</li></ul>
          <input class="sm" placeholder="月" /><ul hidden><li>8</li><li>9</li></ul>
          <input class="ey" placeholder="年" /><ul hidden><li>2024</li><li>${year}</li></ul>
          <input class="em" placeholder="月" /><ul hidden><li>6</li><li>${month}</li></ul>
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
    expect(valueOf(".ey")).toEqual([year, "2024"]);
    expect(valueOf(".em")).toEqual([month, "6"]);
  });

  it("单个日期框遇到至今时写入当天年月日", async () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    document.body.innerHTML = `<label>毕业时间<input id="end" type="date" /></label>`;
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({ educationEndDate: "至今" }, "overwrite");
    expect(document.querySelector<HTMLInputElement>("#end")?.value).toBe(iso);
  });
});
