/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createDomEngine } from "../src/content/dom-engine";

describe("Ant Design 申请表", () => {
  it("跳过区号、禁用项和授权勾选，并按选项与经历段填写", async () => {
    document.body.innerHTML = `
      <div class="field-group"><span class="field-label"><span class="require_tip">*</span>姓名</span><input class="ant-input" id="value" /></div>
      <div class="field-group"><span class="field-label"><span class="require_tip">*</span>性别</span>
        <div class="ant-radio-group">
          <label class="ant-radio-wrapper"><input type="radio" class="ant-radio-input" value="男" /><span>男</span></label>
          <label class="ant-radio-wrapper"><input type="radio" class="ant-radio-input" value="女" /><span>女</span></label>
        </div>
      </div>
      <div class="field-group"><span class="field-label"><span class="require_tip">*</span>手机号</span>
        <div class="ant-select"><div role="combobox" aria-haspopup="listbox" aria-controls="codes"><div class="ant-select-selection-selected-value">中国大陆 + 86</div></div></div>
        <input class="ant-input phone-number" id="value" />
      </div>
      <div class="field-group"><span class="field-label"><span class="require_tip">*</span>邮箱</span><input class="ant-input ant-input-disabled" disabled id="value" /></div>
      <div class="field-group"><span class="field-label"><span class="require_tip">*</span>意向城市</span>
        <div role="combobox" class="ant-select city-select" aria-controls="cities" aria-haspopup="listbox"><div class="ant-select-selection-selected-value"></div></div>
        <div class="ant-select-dropdown" style="display:none"><div id="cities"><ul><li role="option">北京</li><li role="option">上海</li></ul></div></div>
      </div>
      <div class="field-group" style="width:0px"><span class="field-label">隐藏渠道</span><input class="ant-input hidden-channel" id="value" /></div>
      <div groupindex="0" class="section-object edit_mode">
        <div class="field-group"><span class="field-label"><span class="require_tip">*</span>学校名称</span><input class="ant-input school-name" id="value" /></div>
        <div class="field-group"><span class="field-label"><span class="require_tip">*</span>入学日期</span><span class="ant-calendar-picker"><input readonly class="ant-calendar-picker-input ant-input" /></span></div>
        <div class="field-group"><span class="field-label"><span class="require_tip">*</span>专业名称</span><input class="ant-input major-name" id="value" /></div>
        <div class="field-group"><span class="field-label"><span class="require_tip">*</span>专业类别</span>
          <div role="combobox" class="ant-select" aria-controls="majors" aria-haspopup="listbox"><div class="ant-select-selection-selected-value"></div></div>
          <div class="ant-select-dropdown" style="display:none"><div id="majors"><ul><li role="option">信息科学与技术类</li><li role="option">其他类</li></ul></div></div>
        </div>
        <div class="submite"><button type="button" class="confirm-segment">确认</button></div>
      </div>
      <div groupindex="1"><div class="field-group"><span class="field-label"><span class="require_tip">*</span>学校名称</span><input class="ant-input school-name-2" id="value" /></div></div>
      <div class="field-group"><span class="field-label"><span class="require_tip">*</span>是否有实习经验</span>
        <div role="combobox" class="ant-select" aria-controls="intern" aria-haspopup="listbox"><div class="ant-select-selection-selected-value"></div></div>
        <div class="ant-select-dropdown" style="display:none"><div id="intern"><ul><li role="option">是</li><li role="option">否</li></ul></div></div>
      </div>
      <div class="field-group"><span class="field-label"><span class="require_tip">*</span>我进一步同意按照隐私政策处理敏感个人信息并授权</span><input type="checkbox" class="consent-box" /></div>
      <button type="button" id="save_resume">保存去投递</button>
    `;
    const school = document.querySelector<HTMLInputElement>(".school-name")!;
    let schoolClicks = 0;
    school.addEventListener("click", () => { schoolClicks += 1; });
    let confirmClicks = 0;
    let submitClicks = 0;
    document.querySelector(".confirm-segment")?.addEventListener("click", () => { confirmClicks += 1; });
    document.querySelector("#save_resume")?.addEventListener("click", () => { submitClicks += 1; });
    const dateInput = document.querySelector<HTMLInputElement>(".ant-calendar-picker-input")!;
    const vueValues: unknown[] = [];
    (dateInput as HTMLInputElement & { __vue__?: { form: { setFieldsValue: (fields: { value: unknown }) => void } } }).__vue__ = {
      form: { setFieldsValue: (fields) => { vueValues.push(fields.value); } }
    };
    (window as Window & { moment?: (input: string) => unknown }).moment = (input) => ({ formatted: input });

    const engine = createDomEngine(document, "https://careersite.example.com/apply");
    expect(engine.scan().map((field) => field.key)).toEqual([
      "name", "gender", "gender", "phone", "targetCity",
      "school", "educationStartDate", "major", "majorCategory",
      "school", "hasInternship", null
    ]);
    expect(document.querySelector("[aria-controls=codes]")?.hasAttribute("data-offer-star-field-id")).toBe(false);
    expect(document.querySelector(".hidden-channel")?.hasAttribute("data-offer-star-field-id")).toBe(false);
    expect(document.querySelector(".ant-input-disabled")?.hasAttribute("data-offer-star-field-id")).toBe(false);

    const result = await engine.fill({
      name: "测试用户",
      gender: "女",
      phone: "+86-13800000000",
      email: "test@example.com",
      targetCity: "上海",
      school: "示例大学",
      educationStartDate: "2024-09-01",
      major: "数据科学",
      majorCategory: "信息科学与技术类",
      hasInternship: "是"
    }, "overwrite");

    expect(document.querySelector<HTMLInputElement>(".phone-number")?.value).toBe("13800000000");
    expect(document.querySelector<HTMLInputElement>(".ant-radio-input[value=女]")?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>(".ant-radio-input[value=男]")?.checked).toBe(false);
    expect(document.querySelector(".city-select .ant-select-selection-selected-value")?.textContent).toBe("上海");
    expect(school.value).toBe("示例大学");
    expect(document.querySelector<HTMLInputElement>(".school-name-2")?.value).toBe("");
    expect(document.querySelector<HTMLInputElement>(".major-name")?.value).toBe("数据科学");
    expect(document.querySelector("[aria-controls=majors] .ant-select-selection-selected-value")?.textContent).toBe("信息科学与技术类");
    expect(document.querySelector("[aria-controls=intern] .ant-select-selection-selected-value")?.textContent).toBe("是");
    expect(vueValues).toEqual([{ formatted: "2024-09-01" }]);
    expect(document.querySelector<HTMLInputElement>(".consent-box")?.checked).toBe(false);
    expect(document.querySelector<HTMLInputElement>(".ant-input-disabled")?.value).toBe("");
    expect(schoolClicks).toBe(0);
    expect(confirmClicks).toBe(1);
    expect(submitClicks).toBe(0);
    expect(result.failureReasons.email).toBe("没有找到对应页面控件");
    expect(result.filled).toContain("school");
    expect(result.filled).not.toContain("email");
  });

  it("图普申请表按字段行识别，并用页面原生赋值写入", async () => {
    document.body.innerHTML = `
      <form id="candidateForm">
        <div class="cardDetail">
          <div class="field-group"><span class="field-label"><span class="require_tip">*</span>姓名</span><input class="ant-input name-input" id="value" /></div>
          <div class="field-group"><span class="field-label"><span class="require_tip">*</span>手机号</span>
            <div role="combobox" class="ant-select" aria-haspopup="listbox">+86</div>
            <input class="ant-input phone-input" id="value" />
          </div>
          <div class="field-group"><span class="field-label"><span class="require_tip">*</span>性别</span>
            <label><input type="radio" value="男" />男</label>
            <label><input type="radio" value="女" />女</label>
          </div>
          <div class="field-group"><span class="field-label"><span class="require_tip">*</span>意向城市</span>
            <span class="ant-cascader-picker city-picker"><input readonly class="ant-input" /></span>
          </div>
          <div class="ant-cascader-menus"><ul class="ant-cascader-menu"><li class="ant-cascader-menu-item">上海</li></ul></div>
        </div>
      </form>
    `;
    const name = document.querySelector<HTMLInputElement>(".name-input")!;
    let keyups = 0;
    name.addEventListener("keyup", () => { keyups += 1; });
    const engine = createDomEngine(document, "https://careersite.example.com/apply");
    expect(engine.scan().map((field) => field.key)).toEqual(["name", "phone", "gender", "targetCity"]);
    expect(document.querySelector("[role=combobox]")?.hasAttribute("data-offer-star-field-id")).toBe(false);
    const result = await engine.fill({ name: "测试用户", phone: "13800000000", gender: "女", targetCity: "上海" }, "overwrite");
    expect(name.value).toBe("测试用户");
    expect(name.dataset.offerStarAutofillUsed).toBe("1");
    expect(keyups).toBe(1);
    expect(document.querySelector<HTMLInputElement>(".phone-input")?.value).toBe("13800000000");
    expect(document.querySelector<HTMLInputElement>("input[value=女]")?.checked).toBe(true);
    expect(document.querySelector(".city-picker")?.getAttribute("data-offer-star-autofill-used")).toBe("1");
    expect(result.filled).toEqual(expect.arrayContaining(["name", "phone", "gender", "targetCity"]));
  });

  it("图普申请表性别是原生 select 时也能扫描并填写", async () => {
    document.body.innerHTML = `
      <form id="candidateForm">
        <div class="field-group"><span class="field-label"><span class="require_tip">*</span>性别</span>
          <select class="gender-select"><option value="">请选择</option><option value="1">男</option><option value="2">女</option></select>
        </div>
        <div class="field-group"><span class="field-label"><span class="require_tip">*</span>手机号</span>
          <select class="country-code"><option value="+86">+86</option></select>
          <input class="ant-input phone-input" />
        </div>
      </form>
    `;
    const engine = createDomEngine(document, "https://careersite.example.com/apply");
    expect(engine.scan().map((field) => field.key)).toEqual(["gender", "phone"]);
    const result = await engine.fill({ gender: "女", phone: "13800000000" }, "overwrite");
    const genderSelect = document.querySelector<HTMLSelectElement>(".gender-select")!;
    const phoneInput = document.querySelector<HTMLInputElement>(".phone-input")!;
    expect(genderSelect.value).toBe("2");
    expect(phoneInput.value).toBe("13800000000");
    expect(result.filled).toEqual(expect.arrayContaining(["gender", "phone"]));
    expect(result.failed).toEqual([]);
  });

  it("教育背景和实习经历要点添加后才出现输入框", async () => {
    document.body.innerHTML = `
      <form id="candidateForm">
        <div class="add_fieldGroup" style="display: none;"><button type="button" class="add_btn hidden-edu"><i></i> 添加 教育背景 </button></div>
        <section class="edu-block"><div class="add_fieldGroup"><button type="button" class="add_btn add-edu"><i></i> 添加 教育背景 </button></div></section>
        <section class="intern-block"><div class="add_fieldGroup"><button type="button" class="add_btn add-intern"><i></i> 添加 实习经历 </button></div></section>
        <button type="button" id="save_resume">保存去投递</button>
      </form>
    `;
    let submitClicks = 0;
    document.querySelector("#save_resume")?.addEventListener("click", () => { submitClicks += 1; });
    let hiddenClicks = 0;
    document.querySelector(".hidden-edu")?.addEventListener("click", () => { hiddenClicks += 1; });
    const visibleEdu = document.querySelector<HTMLButtonElement>(".add-edu");
    if (visibleEdu) visibleEdu.onclick = () => undefined;
    document.querySelector(".add-edu")?.addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      document.querySelector(".edu-block")?.insertAdjacentHTML("beforeend", `<div class="field-group"><span class="field-label">学校名称</span><input class="ant-input school-input" /></div>`);
    });
    document.querySelector(".add-intern")?.addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      document.querySelector(".intern-block")?.insertAdjacentHTML("beforeend", `<div class="field-group"><span class="field-label">公司名称</span><input class="ant-input company-input" /></div>`);
    });
    const engine = createDomEngine(document, "https://careersite.example.com/apply");
    const result = await engine.fill({ school: "示例大学", company: "示例公司" }, "overwrite", { debug: true });
    expect(document.querySelector<HTMLInputElement>(".school-input")?.value).toBe("示例大学");
    expect(document.querySelector<HTMLInputElement>(".company-input")?.value).toBe("示例公司");
    expect(submitClicks).toBe(0);
    expect(hiddenClicks).toBe(0);
    expect(result.debug?.addButtons.some((item) => item.text.includes("添加 教育背景") && !item.visible && !item.onclick)).toBe(true);
    expect(result.debug?.addButtons.some((item) => item.className.includes("add-edu") && item.visible && item.onclick && item.clickListener.includes("onclick"))).toBe(true);
    expect(document.querySelector(".add-edu")?.getAttribute("style") ?? "").not.toContain("outline");
    expect(result.filled).toEqual(expect.arrayContaining(["school", "company"]));
  });
});
