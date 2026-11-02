/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createDomEngine } from "../src/content/dom-engine";

describe("项目经历卡片", () => {
  it("同一张卡片里的项目描述和项目中职责都用这一段，不拿下一段来填", async () => {
    document.body.innerHTML = `
      <div class="apply-blocks-x">
        <div class="apply-block-a">
          <div>项目名称</div><input class="name" />
          <div>项目描述</div><textarea class="desc"></textarea>
          <textarea class="duty" placeholder="项目中职责"></textarea>
        </div>
        <div class="apply-block-b">
          <div>项目名称</div><input class="name" />
          <div>项目描述</div><textarea class="desc"></textarea>
          <textarea class="duty" placeholder="项目中职责"></textarea>
        </div>
      </div>
    `;
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({
      projectName: ["甲项目", "乙项目"],
      projectDescription: ["甲项目做了分析", "乙项目做了建模"]
    }, "overwrite");
    const text = (selector: string) => Array.from(document.querySelectorAll<HTMLTextAreaElement>(selector)).map((item) => item.value);
    expect(Array.from(document.querySelectorAll<HTMLInputElement>(".name")).map((item) => item.value)).toEqual(["甲项目", "乙项目"]);
    expect(text(".desc")).toEqual(["甲项目做了分析", "乙项目做了建模"]);
    expect(text(".duty")).toEqual(["", ""]);
  });

  it("项目时间的年月下拉按项目起止填写，至今用当天", async () => {
    const today = new Date();
    const year = String(today.getFullYear());
    const month = String(today.getMonth() + 1);
    document.body.innerHTML = `
      <div class="apply-block-p">
        <div>项目时间</div>
        <div class="month-range-select">- 至今
          <input class="sy" placeholder="年" /><ul hidden><li>2024</li><li>${year}</li></ul>
          <input class="sm" placeholder="月" /><ul hidden><li>3</li><li>${month}</li></ul>
          <input class="ey" placeholder="年" /><ul hidden><li>${year}</li></ul>
          <input class="em" placeholder="月" /><ul hidden><li>${month}</li></ul>
        </div>
        <textarea class="duty" placeholder="项目中职责"></textarea>
      </div>
    `;
    document.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      const menu = input.nextElementSibling;
      if (!(menu instanceof HTMLElement)) return;
      input.addEventListener("click", () => { menu.hidden = false; });
      menu.querySelectorAll("li").forEach((item) => item.addEventListener("click", () => {
        input.value = item.textContent ?? "";
        menu.hidden = true;
      }));
    });
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({
      projectStartDate: "2024-03",
      projectEndDate: "Present",
      projectDescription: "甲项目做了分析"
    }, "overwrite");
    expect(document.querySelector<HTMLInputElement>(".sy")?.value).toBe("2024");
    expect(document.querySelector<HTMLInputElement>(".sm")?.value).toBe("3");
    expect(document.querySelector<HTMLInputElement>(".ey")?.value).toBe(year);
    expect(document.querySelector<HTMLInputElement>(".em")?.value).toBe(month);
    expect(document.querySelector<HTMLTextAreaElement>(".duty")?.value).toBe("甲项目做了分析");
  });

  it("同一模块里的四段项目和两段实习按顺序各填各的，添加克隆已填内容时也会改对", async () => {
    document.body.innerHTML = `
      <div class="blockTitle"><span>项目经验</span><button type="button" id="add-project">添加</button></div>
      <div id="projects">
        <div class="item">
          <div>项目名称</div><input class="project-name" />
          <div>项目描述</div><textarea class="project-desc"></textarea>
          <textarea class="project-duty" placeholder="项目中的职责"></textarea>
        </div>
      </div>
      <div class="blockTitle"><span>实习经历</span><button type="button" id="add-intern">添加</button></div>
      <div id="interns">
        <div class="item">
          <div>公司名称</div><input class="company" />
          <div>实习工作职责</div><textarea class="intern-desc"></textarea>
        </div>
      </div>
    `;
    const cloneFilled = (listId: string) => {
      const list = document.querySelector(`#${listId}`)!;
      const source = list.querySelector(".item")!;
      const copy = source.cloneNode(true) as HTMLElement;
      list.appendChild(copy);
    };
    document.querySelector("#add-project")?.addEventListener("click", () => {
      const names = document.querySelectorAll<HTMLInputElement>("#projects .project-name");
      if (names.length >= 4 || !names[0]?.value) return;
      cloneFilled("projects");
    });
    document.querySelector("#add-intern")?.addEventListener("click", () => {
      const companies = document.querySelectorAll<HTMLInputElement>("#interns .company");
      if (companies.length >= 2 || !companies[0]?.value) return;
      cloneFilled("interns");
    });
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({
      projectName: ["项目一", "项目二", "项目三", "项目四"],
      projectDescription: ["描述一", "描述二", "描述三", "描述四"],
      company: ["公司甲", "公司乙"],
      description: ["实习一", "实习二"]
    }, "incremental");
    const values = (selector: string) => Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector)).map((item) => item.value);
    expect(values(".project-name")).toEqual(["项目一", "项目二", "项目三", "项目四"]);
    expect(values(".project-desc")).toEqual(["描述一", "描述二", "描述三", "描述四"]);
    expect(values(".project-duty")).toEqual(["", "", "", ""]);
    expect(values(".company")).toEqual(["公司甲", "公司乙"]);
    expect(values(".intern-desc")).toEqual(["实习一", "实习二"]);
  });
});

describe("明显不相关的字段", () => {
  it("推荐码和户籍地址保持空白，自我描述只用自我介绍", async () => {
    document.body.innerHTML = `
      <div class="apply-field"><div class="title"><span>职位名称</span></div><div class="ctrl"><input id="job" /></div></div>
      <div class="apply-field"><div class="title"><span>推荐码</span></div><div class="ctrl"><input id="code" /></div></div>
      <div class="apply-field"><div class="title"><span>户籍地址 *</span></div><div class="ctrl"><input id="hukou" /></div></div>
      <div class="apply-field"><div class="title"><span>自我描述</span></div><div class="ctrl"><textarea id="about"></textarea></div></div>
    `;
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    expect(engine.scan().map((field) => field.key)).toEqual(["position", null, null, "selfIntroduction"]);
    await engine.fill({
      position: ["产品经理助理", "市场信息分析师"],
      description: "语音信号分析与处理",
      selfIntroduction: "善于把复杂问题讲清楚"
    }, "overwrite");
    expect(document.querySelector<HTMLInputElement>("#job")?.value).toBe("产品经理助理");
    expect(document.querySelector<HTMLInputElement>("#code")?.value).toBe("");
    expect(document.querySelector<HTMLInputElement>("#hukou")?.value).toBe("");
    expect(document.querySelector<HTMLTextAreaElement>("#about")?.value).toBe("善于把复杂问题讲清楚");
  });

  it("语言类型不会写入技能与证书", async () => {
    document.body.innerHTML = `
      <div><div>专业技能</div><textarea id="skills"></textarea></div>
      <div><div>语言类型</div><input id="lang" /></div>
      <div><div>掌握程度</div><input id="level" placeholder="请选择" /></div>
    `;
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    expect(engine.scan().map((field) => field.key)).toEqual(["skills", "language", null]);
    await engine.fill({ skills: "英语能力：IELTS 6.5、英语六级", language: "" }, "overwrite");
    expect(document.querySelector<HTMLTextAreaElement>("#skills")?.value).toBe("英语能力：IELTS 6.5、英语六级");
    expect(document.querySelector<HTMLInputElement>("#lang")?.value).toBe("");
    expect(document.querySelector<HTMLInputElement>("#level")?.value).toBe("");
  });

  it("隐藏的时间模板不会占掉可见项目时间，只显示 - 至今时仍填开始年月", async () => {
    document.body.innerHTML = `
      <div class="apply-block-hidden" style="display:none">
        <div class="apply-field-hidden date_info-hidden">
          <div class="title"><span>项目时间</span></div>
          <div class="ctrl"><div class="month-range-select">- 至今
            <input class="hsy" placeholder="年" /><ul hidden><li>2020</li></ul>
            <input class="hsm" placeholder="月" /><ul hidden><li>1</li></ul>
          </div></div>
        </div>
      </div>
      <div class="apply-block-show">
        <div class="apply-field-show date_info-show">
          <div class="title"><span>项目时间</span></div>
          <div class="ctrl"><div class="month-range-select" id="visible-range">- 至今
            <input id="sy" placeholder="年" /><ul id="sy-menu" hidden><li>2024</li><li>2026</li></ul>
            <input id="sm" placeholder="月" /><ul id="sm-menu" hidden><li>3</li><li>10</li></ul>
          </div></div>
        </div>
      </div>
    `;
    for (const id of ["sy", "sm"]) {
      const input = document.querySelector<HTMLInputElement>(`#${id}`)!;
      const menu = document.querySelector<HTMLElement>(`#${id}-menu`)!;
      input.addEventListener("click", () => { menu.hidden = false; });
      menu.querySelectorAll("li").forEach((item) => item.addEventListener("click", () => {
        input.value = item.textContent ?? "";
        menu.hidden = true;
      }));
    }
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({ projectStartDate: "2024-03", projectEndDate: "Present" }, "overwrite");
    expect(document.querySelector<HTMLInputElement>("#sy")?.value).toBe("2024");
    expect(document.querySelector<HTMLInputElement>("#sm")?.value).toBe("3");
    expect(document.querySelector<HTMLInputElement>(".hsy")?.value ?? "").toBe("");
  });

  it("结束侧只有至今文字、年份输入框被 aria-hidden 时，仍填开始年月", async () => {
    document.body.innerHTML = `
      <div class="apply-blocks-ir_MrIodtj">
        <div class="apply-block-KRDTLLb5hU">
          <div class="apply-fields-Bzc">
            <div class="apply-field-Q2i date_info-nCj">
              <div class="label-x"><span>起止时间</span></div>
              <div class="ctrl-CIC">
                <div class="month-range-select date_info wrapper-Wilqy7sjl0" id="range">
                  <label class="sd-Select-container-1Eq4x"><input id="sy" aria-hidden="true" placeholder="" /><ul id="sy-menu" hidden><li>2024</li></ul></label>
                  <label class="sd-Select-container-1Eq4x"><input id="sm" aria-hidden="true" placeholder="" /><ul id="sm-menu" hidden><li>3</li></ul></label>
                  <span>-</span><span>至今</span>
                </div>
              </div>
            </div>
            <div>项目名称</div><input class="name" />
          </div>
        </div>
      </div>
    `;
    for (const id of ["sy", "sm"]) {
      const input = document.querySelector<HTMLInputElement>(`#${id}`)!;
      const menu = document.querySelector<HTMLElement>(`#${id}-menu`)!;
      input.addEventListener("click", () => { menu.hidden = false; });
      menu.querySelectorAll("li").forEach((item) => item.addEventListener("click", () => {
        input.value = item.textContent ?? "";
        menu.hidden = true;
      }));
    }
    const engine = createDomEngine(document, "https://careers.example.com/apply");
    await engine.fill({ projectName: "甲项目", projectStartDate: "2024-03", projectEndDate: "Present" }, "overwrite");
    expect(document.querySelector<HTMLInputElement>("#sy")?.value).toBe("2024");
    expect(document.querySelector<HTMLInputElement>("#sm")?.value).toBe("3");
    expect(document.querySelector("#range")?.textContent).toContain("至今");
  });
});
