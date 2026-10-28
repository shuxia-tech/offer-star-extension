import type { DetectedField, FieldValue, FilePayload } from "../shared/messages";
import { guessFieldKey, shouldFillExistingValue } from "../shared/field-matching";
import { createFillHistory } from "../shared/fill-history";
import { getSiteAdapter } from "../shared/site-adapters";
import { validateFieldValue } from "../shared/field-value-validation";
import { sanitizePageUrl } from "../shared/privacy";

export type DomEngine = {
  scan(): DetectedField[];
  scanDeep(): Promise<DetectedField[]>;
  fill(values: Record<string, FieldValue>, mode: "incremental" | "overwrite"): Promise<{ filled: string[]; failed: string[]; failureReasons: Record<string, string> }>;
  undo(): Promise<{ restored: string[] }>;
  advanceStep(): Promise<{ advanced: boolean; label?: string }>;
  fillPhoto(dataUrl: string, fileName: string, mimeType: string): Promise<{ filled: boolean }>;
  fillFiles(files: FilePayload[]): Promise<{ filled: boolean; count: number; failed: string[] }>;
};

/** 页面 DOM 填写引擎。消息路由只负责浏览器通信，所有字段操作都在这里集中实现并可独立测试。 */
export function createDomEngine(document: Document, pageUrl: string): DomEngine {
  const fillHistory = createFillHistory<HTMLElement>();

  /** 查询主文档、开放式 Shadow DOM 和同源 iframe；跨域 iframe 由浏览器安全策略自然隔离。 */
  function queryAllDeep<T extends HTMLElement>(selector: string, root: Document | ShadowRoot = document, depth = 0): T[] {
    if (depth > 3) return [];
    const result = Array.from(root.querySelectorAll<T>(selector));
    for (const host of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      if (host.shadowRoot) result.push(...queryAllDeep<T>(selector, host.shadowRoot, depth + 1));
      if (host.tagName === "IFRAME") {
        try {
          const frameDocument = (host as HTMLIFrameElement).contentDocument;
          if (frameDocument) result.push(...queryAllDeep<T>(selector, frameDocument, depth + 1));
        } catch (error) {
          console.warn("[Offer Star][Content] 无法读取跨域 iframe，已跳过", error);
        }
      }
    }
    return result;
  }

  function ownerWindow(element: HTMLElement) {
    return element.ownerDocument.defaultView ?? window;
  }

  function cleanLabel(text: string) {
    return text.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  }

  /** Ant Design 字段标题在 .field-label 里，不能把重复的 id="value" 当成字段名。 */
  function explicitFieldLabel(element: HTMLElement) {
    const label = element.closest(".field-group")?.querySelector(".field-label");
    return label ? cleanLabel(label.textContent ?? "") : "";
  }

  function isCollapsedGroup(element: HTMLElement) {
    const group = element.closest(".field-group");
    if (!(group instanceof HTMLElement)) return false;
    const inlineWidth = group.style.width.trim();
    const inlineHeight = group.style.height.trim();
    if (inlineWidth === "0" || inlineWidth === "0px" || inlineHeight === "0" || inlineHeight === "0px") return true;
    const style = ownerWindow(group).getComputedStyle(group);
    return style.display === "none" || style.visibility === "hidden" || style.width === "0px" || style.height === "0px";
  }

  function isEffectivelyHidden(element: HTMLElement) {
    let current: HTMLElement | null = element;
    while (current) {
      if (current.getAttribute("aria-hidden") === "true" || current.hasAttribute("hidden")) return true;
      const style = ownerWindow(current).getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") return true;
      if (current === element.ownerDocument.body) break;
      current = current.parentElement;
    }
    return false;
  }

  /** 手机号旁边的国家区号下拉不是电话号码本身。 */
  function isPhoneCountryControl(element: HTMLElement) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT") return false;
    const selectable = element.getAttribute("role") === "combobox" || element.getAttribute("aria-haspopup") === "listbox" || Boolean(element.closest(".ant-select"));
    return selectable && /手机|电话/.test(explicitFieldLabel(element));
  }

  function isNoiseControl(element: HTMLElement) {
    if (element.closest(".ant-select-dropdown, .ant-calendar-picker-container, .filevalues_Placeholder, .tailoring-container")) return true;
    if ((element as HTMLInputElement).disabled || element.getAttribute("aria-disabled") === "true") return true;
    if (isCollapsedGroup(element) || isEffectivelyHidden(element) || isPhoneCountryControl(element)) return true;
    return false;
  }

  function labelFor(element: HTMLElement) {
    const explicit = explicitFieldLabel(element);
    if (explicit) return explicit;
    const input = element as HTMLInputElement;
    const root = element.getRootNode() as Document | ShadowRoot;
    const labelledBy = input.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => root.getElementById?.(id)?.textContent).filter(Boolean).join(" ");
    const describedBy = input.getAttribute("aria-describedby")?.split(/\s+/).map((id) => root.getElementById?.(id)?.textContent).filter(Boolean).join(" ");
    const directDataLabel = input.getAttribute("data-label") ?? input.getAttribute("data-field-label");
    let containerDataLabel: string | undefined;
    for (let parent = element.parentElement, depth = 0; parent && depth < 3; parent = parent.parentElement, depth += 1) {
      const candidate = parent.getAttribute("data-label") ?? parent.getAttribute("data-field-label");
      if (!candidate) continue;
      const controlsInContainer = parent.querySelectorAll("input:not([type=hidden]), textarea, select, [contenteditable=true], [role=combobox], [role=checkbox], [role=radio], [aria-haspopup=listbox]");
      if (controlsInContainer.length === 1 && controlsInContainer[0] === element) {
        containerDataLabel = candidate;
      }
      break;
    }
    const dataLabel = directDataLabel ?? containerDataLabel;
    const legend = element.closest("fieldset")?.querySelector("legend")?.textContent;
    const previousText = element.previousElementSibling?.textContent?.trim();
    const nearbyTitle = previousText && previousText.length <= 80 && !element.previousElementSibling?.querySelector("input, textarea, select, [role=combobox]")
      ? previousText
      : undefined;
    const nearbyLabel = element.parentElement?.tagName === "LABEL"
      ? element.parentElement.textContent
      : element.parentElement !== document.body
        ? element.parentElement?.querySelector<HTMLElement>(":scope > label")?.textContent
        : undefined;
    const groupLabel = element.closest('[role="radiogroup"], [role="group"]')?.getAttribute("aria-label")
      ?? element.closest('[role="radiogroup"], [role="group"]')?.getAttribute("aria-labelledby");
    const semanticType = input.type === "email" || input.type === "tel" ? input.type : undefined;
    return [input.name, input.id, input.placeholder, input.getAttribute("aria-label"), labelledBy, describedBy, dataLabel, legend, nearbyTitle, input.getAttribute("autocomplete"), semanticType, groupLabel, element.closest("label")?.textContent, nearbyLabel].filter(Boolean).join(" ").trim();
  }

  function controls() {
    return queryAllDeep<HTMLElement>("input:not([type=hidden]), textarea, select, [contenteditable=true], [role=combobox], [role=checkbox], [role=radio], [aria-haspopup=listbox]").filter((element) => !isNoiseControl(element));
  }

  function scan() {
    const adapter = getSiteAdapter(pageUrl);
    const result = controls().map((element, elementIndex) => {
      const label = labelFor(element);
      const guess = guessFieldKey(label);
      const id = `offer-star-field-${elementIndex}`;
      element.dataset.offerStarFieldId = id;
      return { id, key: guess.key, label, type: element.tagName.toLowerCase(), elementIndex, confidence: guess.confidence };
    });
    console.info("[Offer Star][Content] 页面扫描完成", { 站点: adapter.name, 字段数量: result.length, 页面地址: sanitizePageUrl(pageUrl) });
    return result;
  }

  /** 以有限次数触发页面懒加载，完成后恢复用户滚动位置。 */
  async function scanDeep() {
    const win = document.defaultView;
    const originalX = win?.scrollX ?? 0;
    const originalY = win?.scrollY ?? 0;
    let previousCount = controls().length;
    try {
      for (let pass = 0; pass < 3; pass += 1) {
        const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
        try { win?.scrollTo?.(0, pass % 2 === 0 ? height : 0); } catch { /* jsdom 等环境不支持滚动 */ }
        win?.dispatchEvent(new Event("scroll"));
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const currentCount = controls().length;
        if (currentCount === previousCount && pass > 0) break;
        previousCount = currentCount;
      }
    } finally {
      try { win?.scrollTo?.(originalX, originalY); } catch { /* 忽略不支持滚动的环境 */ }
      win?.dispatchEvent(new Event("scroll"));
    }
    console.info("[Offer Star][Content] 深度扫描完成", { 字段数量: controls().length });
    return scan();
  }

  async function setValue(element: HTMLElement, value: string): Promise<boolean> {
    if (element.tagName === "INPUT" && ["radio", "checkbox"].includes((element as HTMLInputElement).type)) {
      const input = element as HTMLInputElement;
      if (input.type === "radio") {
        const named = input.name ? queryAllDeep<HTMLInputElement>("input[type=radio]").filter((item) => item.name === input.name) : [];
        const scope = input.closest(".ant-radio-group, [role=radiogroup], fieldset, .field-group");
        const group = named.length ? named : scope ? Array.from(scope.querySelectorAll<HTMLInputElement>("input[type=radio]")) : [input];
        if (!value) {
          group.forEach((item) => { item.checked = false; });
          return true;
        }
        const wanted = value.replace(/\s+/g, "");
        const target = group.find((item) => {
          const text = `${item.value} ${item.closest("label")?.textContent ?? ""}`.replace(/\s+/g, "");
          return item.value === value || text.includes(wanted);
        });
        if (!target) return false;
        target.checked = true;
        const EventConstructor = ownerWindow(target).Event;
        target.dispatchEvent(new EventConstructor("input", { bubbles: true }));
        target.dispatchEvent(new EventConstructor("change", { bubbles: true }));
        target.dispatchEvent(new EventConstructor("blur", { bubbles: true }));
        return true;
      } else {
        const labelText = input.closest("label")?.textContent ?? input.parentElement?.textContent ?? "";
        if (/同意|协议|隐私|授权|营销/.test(labelText)) return false;
        const shouldCheck = ["true", "1", "yes", "y", "是", "有", "同意", "已婚"].includes(value.trim().toLowerCase());
        input.checked = shouldCheck;
      }
    } else if (["checkbox", "radio"].includes(element.getAttribute("role") ?? "")) {
      const role = element.getAttribute("role");
      const labelText = element.getAttribute("aria-label") ?? element.textContent ?? element.parentElement?.textContent ?? "";
      if (role === "checkbox") {
        if (/同意|协议|隐私|授权|营销/.test(labelText)) return false;
        const shouldCheck = ["true", "1", "yes", "y", "是", "有", "同意", "已婚"].includes(value.trim().toLowerCase());
        const isChecked = element.getAttribute("aria-checked") === "true";
        if (isChecked !== shouldCheck) await element.click();
        element.setAttribute("aria-checked", String(shouldCheck));
      } else {
        const group = element.closest('[role="radiogroup"]') ?? element.parentElement;
        const options = group ? Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')) : [element];
        const target = options.find((option) => [option.getAttribute("data-value"), option.getAttribute("aria-label"), option.textContent].filter(Boolean).join(" ").includes(value));
        if (!value || !target) return false;
        options.forEach((option) => option.setAttribute("aria-checked", String(option === target)));
        await target.click();
      }
    } else if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
      element.textContent = value;
      const InputEventConstructor = ownerWindow(element).InputEvent ?? InputEvent;
      element.dispatchEvent(new InputEventConstructor("input", { bubbles: true, inputType: "insertText", data: value }));
    } else if (element.tagName === "SELECT") {
      const select = element as HTMLSelectElement;
      const wanted = select.multiple ? value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean) : [value];
      let matched: HTMLOptionElement[] = [];
      // 原生级联下拉的 option 可能由接口异步插入，有限等待后再判定失败。
      for (let attempt = 0; attempt < 8 && !matched.length; attempt += 1) {
        matched = Array.from(select.options).filter((item) => wanted.some((target) => item.textContent?.trim().includes(target) || item.value === target));
        if (!matched.length && attempt < 7) await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      if (!matched.length) return false;
      if (select.multiple) {
        Array.from(select.options).forEach((item) => { item.selected = matched.includes(item); });
      } else {
        select.value = matched[0].value;
      }
    } else if (element.getAttribute("role") === "combobox" || element.getAttribute("aria-haspopup") === "listbox") {
      if (!value) {
        element.textContent = "";
        element.removeAttribute("data-value");
        return true;
      }
      await element.click();
      revealAntMenu(element);
      if (element.tagName === "INPUT") {
        const input = element as HTMLInputElement;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
        const EventConstructor = ownerWindow(element).Event;
        element.dispatchEvent(new EventConstructor("input", { bubbles: true }));
        await Promise.resolve();
      }
      const candidates = dateCandidates(value);
      let option: HTMLElement | undefined;
      // 虚拟列表/异步请求可能稍晚插入候选项，最多等待 8 轮，避免无限等待。
      for (let attempt = 0; attempt < 8 && !option; attempt += 1) {
        revealAntMenu(element);
        const menuId = element.getAttribute("aria-controls");
        const menu = menuId ? element.ownerDocument.getElementById(menuId) : null;
        const scoped = menu ? Array.from(menu.querySelectorAll<HTMLElement>("[role=option], [data-value]")) : [];
        option = pickOption(scoped, candidates) ?? pickOption(queryAllDeep<HTMLElement>("[role=option], [data-value]"), candidates);
        if (!option) {
          // 虚拟列表只渲染可视区域，滚动列表容器后再查找一次目标项。
          for (const listbox of queryAllDeep<HTMLElement>("[role=listbox]")) {
            if (listbox.scrollHeight > listbox.clientHeight) {
              listbox.scrollTop = Math.min(listbox.scrollTop + Math.max(listbox.clientHeight, 120), listbox.scrollHeight);
              const EventConstructor = ownerWindow(listbox).Event;
              listbox.dispatchEvent(new EventConstructor("scroll", { bubbles: true }));
            }
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 25));
        }
      }
      if (!option) return false;
      await option.click();
      const selected = element.querySelector(".ant-select-selection-selected-value");
      if (selected) selected.textContent = cleanLabel(option.textContent ?? value);
      const optionText = cleanLabel(option.textContent ?? value);
      commitVueValue(element, optionText || value);
    } else if (isAntDateInput(element)) {
      const formatted = formatAntDate(value);
      const momentFactory = (ownerWindow(element) as Window & { moment?: (input: string) => unknown }).moment;
      if (momentFactory && commitVueValue(element, momentFactory(formatted))) return true;
      element.setAttribute("data-offer-star-kind", "date");
      const committed = commitVueValue(element, formatted, true);
      element.removeAttribute("data-offer-star-kind");
      if (committed) return true;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, formatted);
    } else {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const inputType = element.tagName === "INPUT" ? (input as HTMLInputElement).type : "";
      const normalizedValue = inputType === "date" || inputType === "month" ? normalizeDateValue(value, inputType) : normalizePhoneValue(element, value);
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, normalizedValue);
      if (element.classList.contains("ant-input") || element.closest(".ant-form")) commitVueValue(element, normalizedValue, true);
    }
    const EventConstructor = ownerWindow(element).Event;
    element.dispatchEvent(new EventConstructor("input", { bubbles: true }));
    element.dispatchEvent(new EventConstructor("change", { bubbles: true }));
    element.dispatchEvent(new EventConstructor("blur", { bubbles: true }));
    return true;
  }

  function revealAntMenu(element: HTMLElement) {
    const menuId = element.getAttribute("aria-controls");
    if (!menuId) return;
    const menu = element.ownerDocument.getElementById(menuId);
    const dropdown = menu?.closest(".ant-select-dropdown");
    if (dropdown instanceof HTMLElement) dropdown.style.display = "block";
  }

  function optionScore(text: string, optionValue: string, candidates: string[]) {
    const clean = cleanLabel(text);
    let best = 0;
    for (const candidate of candidates) {
      const wanted = cleanLabel(candidate);
      if (!wanted) continue;
      if (clean === wanted || optionValue === wanted) best = Math.max(best, 3);
      else if (clean.startsWith(wanted)) best = Math.max(best, 2);
      else if (wanted.length >= 2 && (clean.includes(wanted) || optionValue.includes(wanted))) best = Math.max(best, 1);
    }
    return best;
  }

  function pickOption(pool: HTMLElement[], candidates: string[]) {
    let best: { option: HTMLElement; score: number } | undefined;
    for (const item of pool) {
      if (!isVisible(item)) continue;
      const score = optionScore(item.textContent ?? "", item.getAttribute("data-value") ?? "", candidates);
      if (score > (best?.score ?? 0)) best = { option: item, score };
    }
    return best?.option;
  }

  function commitVueValue(element: HTMLElement, value: unknown, askPage = false) {
    try {
      let current: HTMLElement | null = element;
      for (let depth = 0; current && depth < 8; current = current.parentElement, depth += 1) {
        const vue = (current as HTMLElement & { __vue__?: { form?: { setFieldsValue?: (fields: Record<string, unknown>) => void } } }).__vue__;
        if (!vue?.form?.setFieldsValue) continue;
        vue.form.setFieldsValue({ value });
        return true;
      }
    } catch {
      // 内容脚本看不到页面世界里的 Vue 实例，交给页面桥接处理。
    }
    if (!askPage || (typeof value !== "string" && typeof value !== "number")) return false;
    element.setAttribute("data-offer-star-pending", String(value));
    element.dispatchEvent(new CustomEvent("offer-star-commit-field", { bubbles: true }));
    const committed = element.getAttribute("data-offer-star-vue") === "ok";
    element.removeAttribute("data-offer-star-pending");
    element.removeAttribute("data-offer-star-vue");
    return committed;
  }

  function isAntDateInput(element: HTMLElement) {
    return element.classList.contains("ant-calendar-picker-input") || Boolean((element as HTMLInputElement).readOnly && element.closest(".ant-calendar-picker"));
  }

  /** 按天选择的日期控件需要完整日期；只有年月时补 1 日，避免被页面校验清空。 */
  function formatAntDate(value: string) {
    const match = value.trim().match(/^(\d{4})[年./-](\d{1,2})(?:[月./-](\d{1,2}))?/);
    if (!match) return value.trim();
    const day = (match[3] ?? "01").padStart(2, "0");
    return `${match[1]}-${match[2].padStart(2, "0")}-${day}`;
  }

  function normalizePhoneValue(element: HTMLElement, value: string) {
    const group = element.closest(".field-group");
    if (group?.querySelector("[role=combobox], .ant-select") && /手机|电话/.test(explicitFieldLabel(element))) {
      return value.replace(/^\+?86[-\s]?/, "");
    }
    return value;
  }

  function normalizeDateValue(value: string, inputType: string) {
    const match = value.trim().match(/^(\d{4})[年./-](\d{1,2})(?:[月./-](\d{1,2}))?/);
    if (!match) return value;
    const year = match[1];
    const month = match[2].padStart(2, "0");
    if (inputType === "month") return `${year}-${month}`;
    const day = (match[3] ?? "01").padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateCandidates(value: string) {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4})[年./-](\d{1,2})(?:[月./-](\d{1,2}))?/);
    if (!match) return [trimmed];
    const year = match[1];
    const month = match[2].padStart(2, "0");
    const day = match[3]?.padStart(2, "0");
    return [trimmed, `${year}-${month}${day ? `-${day}` : ""}`, `${year}/${month}${day ? `/${day}` : ""}`, `${year}年${Number(month)}月${day ? `${Number(day)}日` : ""}`];
  }

  function currentValue(element: HTMLElement) {
    if (element.isContentEditable || element.getAttribute("contenteditable") === "true") return element.textContent ?? "";
    if (["checkbox", "radio"].includes(element.getAttribute("role") ?? "")) {
      return element.getAttribute("aria-checked") === "true" ? (element.getAttribute("data-value") || element.getAttribute("aria-label") || element.textContent?.trim() || "true") : "";
    }
    if (element.tagName === "INPUT" && ["radio", "checkbox"].includes((element as HTMLInputElement).type)) {
      const input = element as HTMLInputElement;
      return input.checked ? (input.value || "true") : "";
    }
    if (element.getAttribute("role") === "combobox" || element.getAttribute("aria-haspopup") === "listbox") {
      const selectedText = cleanLabel(element.querySelector(".ant-select-selection-selected-value")?.textContent ?? "");
      if (selectedText) return selectedText;
      return element.getAttribute("data-value") ?? ("value" in element ? String((element as HTMLInputElement).value ?? "") : "");
    }
    return "value" in element ? String((element as HTMLInputElement).value ?? "") : "";
  }

  /** 仅为重复经历字段寻找明确的“新增”按钮，避免误触提交、删除和普通操作按钮。 */
  async function expandRepeatedSections(values: Record<string, FieldValue>) {
      const groups: Array<{ keys: string[]; buttonPattern: RegExp }> = [
        { keys: ["company", "position", "startDate", "endDate", "description"], buttonPattern: /(新增|添加|继续添加).*(工作|经历|任职)/i },
        { keys: ["projectName", "projectRole", "projectStartDate", "projectEndDate", "projectDescription"], buttonPattern: /(新增|添加|继续添加).*(项目|项目经历|作品)/i },
        { keys: ["school", "major", "degree", "majorCategory", "educationStartDate", "educationEndDate"], buttonPattern: /(新增|添加|继续添加).*(教育|学校|学历)/i }
      ];
    for (const group of groups) {
      const requested = Math.max(...group.keys.map((key) => {
        const value = values[key];
        return Array.isArray(value) ? value.length : 0;
      }), 0);
      if (requested <= 1) continue;
      let current = Math.max(...group.keys.map((key) => scan().filter((field) => field.key === key).length), 0);
      const buttons = () => queryAllDeep<HTMLElement>("button, [role=button]").filter((button) => group.buttonPattern.test(button.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      let attempts = 0;
      while (current < requested && attempts < requested) {
        const button = buttons()[0];
        if (!button) break;
        await button.click();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const next = Math.max(...group.keys.map((key) => scan().filter((field) => field.key === key).length), 0);
        if (next <= current) break;
        current = next;
        attempts += 1;
      }
    }
  }

  function fieldAt(currentFields: DetectedField[], occurrence: number) {
    const grouped = currentFields.find((field) => controls()[field.elementIndex]?.closest("[groupindex]")?.getAttribute("groupindex") === String(occurrence));
    if (grouped) return grouped;
    const hasGroups = currentFields.some((field) => controls()[field.elementIndex]?.closest("[groupindex]"));
    return hasGroups ? undefined : currentFields[occurrence];
  }

  async function writeFields(values: Record<string, FieldValue>, mode: "incremental" | "overwrite", filled: string[], failed: string[], failureReasons: Record<string, string>, only?: Set<string>) {
    const misses: string[] = [];
    for (const [key, nextValue] of Object.entries(values)) {
      if (key === "photo" || key === "attachment") continue;
      const valuesForKey = Array.isArray(nextValue) ? nextValue : [nextValue];
      for (let index = 0; index < valuesForKey.length; index += 1) {
        const failedKey = Array.isArray(nextValue) ? `${key}[${index + 1}]` : key;
        if (only && !only.has(failedKey)) continue;
        if (!String(valuesForKey[index] ?? "").trim()) continue;
        const validationError = validateFieldValue(key, valuesForKey[index]);
        if (validationError) {
          failed.push(failedKey);
          failureReasons[failedKey] = validationError;
          continue;
        }
        // 每次写入前重新扫描，兼容 React/Vue 输入事件导致的节点替换。
        const currentFields = scan().filter((item) => item.key === key);
        const field = fieldAt(currentFields, index);
        const element = field ? controls()[field.elementIndex] : undefined;
        if (!element) {
          failed.push(failedKey);
          failureReasons[failedKey] = "没有找到对应页面控件";
          misses.push(failedKey);
          continue;
        }
        const previousValue = currentValue(element);
        if (previousValue && !shouldFillExistingValue(mode, previousValue)) continue;
        if (await setValue(element, valuesForKey[index])) {
          fillHistory.add({ target: element, value: previousValue });
          filled.push(key);
        } else {
          failed.push(failedKey);
          failureReasons[failedKey] = "控件不支持该值或候选项未匹配";
        }
      }
    }
    return misses;
  }

  /** 只确认当前正在编辑的经历段，不点击申请、提交或投递。 */
  async function confirmEditedSegments() {
    const buttons = queryAllDeep<HTMLButtonElement>("button").filter((button) => {
      const text = cleanLabel(button.textContent ?? "");
      if (text !== "确认") return false;
      if (!button.closest(".edit_mode, .section-list, .submite")) return false;
      if (button.closest("form") && button.getAttribute("type") !== "button") return false;
      return !button.disabled && button.getAttribute("aria-disabled") !== "true" && isVisible(button);
    });
    for (const button of buttons) await button.click();
  }

  async function fill(values: Record<string, FieldValue>, mode: "incremental" | "overwrite") {
    const filled: string[] = [];
    const failed: string[] = [];
    const failureReasons: Record<string, string> = {};
    fillHistory.reset();
    await expandRepeatedSections(values);
    const misses = await writeFields(values, mode, filled, failed, failureReasons);
    if (misses.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await expandRepeatedSections(values);
      for (const miss of misses) {
        const index = failed.indexOf(miss);
        if (index >= 0) failed.splice(index, 1);
        delete failureReasons[miss];
      }
      await writeFields(values, mode, filled, failed, failureReasons, new Set(misses));
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await confirmEditedSegments();
    if (failed.length) console.warn("[Offer Star][Content] 填写失败明细", { 失败数量: failed.length });
    return { filled, failed, failureReasons };
  }

  async function undo() {
    const restored: string[] = [];
    for (const item of fillHistory.consume()) {
      if (await setValue(item.target, item.value)) restored.push(item.target.dataset.offerStarFieldId ?? "字段");
    }
    return { restored };
  }

  /** 点击安全的步骤导航按钮；明确排除提交、投递和完成类动作。 */
  async function advanceStep() {
    const candidates = queryAllDeep<HTMLElement>("button, [role=button], input[type=button], input[type=submit]");
    const nextPattern = /^(下一步|继续|保存并继续|继续填写|下一页|下一题|确认并继续)$/;
    const blockedPattern = /提交|投递|发送|完成|确认申请|立即申请/;
    const target = candidates.find((button) => {
      const text = (button.textContent || (button as HTMLInputElement).value || "").replace(/\s+/g, " ").trim();
      return nextPattern.test(text) && !blockedPattern.test(text) && !(button as HTMLButtonElement).disabled && button.getAttribute("aria-disabled") !== "true" && isVisible(button);
    });
    if (!target) {
      console.info("[Offer Star][Content] 未找到安全的下一步按钮");
      return { advanced: false };
    }
    const label = (target.textContent || (target as HTMLInputElement).value || "").replace(/\s+/g, " ").trim();
    await target.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    console.info("[Offer Star][Content] 已点击网申步骤按钮", { 按钮: label });
    return { advanced: true, label };
  }

  function isVisible(element: HTMLElement) {
    return !isEffectivelyHidden(element);
  }

  async function fillPhoto(dataUrl: string, fileName: string, mimeType: string) {
    const result = await fillFiles([{ dataUrl, fileName, mimeType }]);
    return { filled: result.filled };
  }

  function allowedFileType(file: FilePayload) {
    return file.mimeType.startsWith("image/") || [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ].includes(file.mimeType) || /\.(pdf|docx?)$/i.test(file.fileName);
  }

  /** 给文件控件写入用户选择的附件；单文件控件只写入第一个文件。 */
  async function fillFiles(files: FilePayload[]) {
    const failed: string[] = [];
    const validFiles = files.filter((file) => {
      if (!allowedFileType(file) || file.dataUrl.length > 8 * 1024 * 1024) {
        failed.push(file.fileName || "未命名附件");
        return false;
      }
      return true;
    });
    let inputs = queryAllDeep<HTMLInputElement>("input[type=file]");
    if (!inputs.length) {
      inputs = await revealDelayedFileInputs();
    }
    if (!inputs.length || !validFiles.length) return { filled: false, count: 0, failed };
    const remaining = [...validFiles];
    const assignments: Array<{ input: HTMLInputElement; files: FilePayload[] }> = [];
    for (const input of inputs) {
      if (!remaining.length) break;
      const matching = remaining.filter((item) => acceptsFile(input, item));
      if (input.multiple) {
        const selected = matching.length || inputs.length === 1 ? (matching.length ? matching : [...remaining]) : [];
        if (selected.length) {
          assignments.push({ input, files: selected });
          selected.forEach((item) => remaining.splice(remaining.indexOf(item), 1));
        }
      } else {
        const selected = matching[0] ?? (!input.accept ? remaining[0] : undefined);
        if (selected) {
          assignments.push({ input, files: [selected] });
          remaining.splice(remaining.indexOf(selected), 1);
        }
      }
    }
    remaining.forEach((item) => failed.push(item.fileName || "未命名附件"));
    let writtenCount = 0;
    for (const assignment of assignments) {
      const filesToWrite: File[] = [];
      for (const item of assignment.files) {
      const match = item.dataUrl.match(/^data:[^;]+;base64,(.*)$/);
      if (!match) {
        failed.push(item.fileName || "未命名附件");
        continue;
      }
      try {
        const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
        filesToWrite.push(new File([bytes], item.fileName, { type: item.mimeType }));
      } catch {
        failed.push(item.fileName || "未命名附件");
      }
      }
      if (!filesToWrite.length) continue;
      const DataTransferConstructor = assignment.input.ownerDocument.defaultView?.DataTransfer ?? document.defaultView?.DataTransfer;
      writeFilesToInput(assignment.input, filesToWrite, DataTransferConstructor);
      writtenCount += filesToWrite.length;
    }
    if (!writtenCount) return { filled: false, count: 0, failed };
    console.info("[Offer Star][Content] 附件已写入文件控件", { 文件数量: writtenCount, 控件数量: assignments.length });
    return { filled: true, count: writtenCount, failed };
  }

  /** 只点击页面明确标记为“展开上传控件”的按钮，避免误触发系统文件选择器或提交按钮。 */
  async function revealDelayedFileInputs() {
    const candidates = queryAllDeep<HTMLElement>("button[data-upload-reveal], [role=button][data-upload-reveal], label[data-upload-reveal]")
      .filter((element) => isVisible(element) && element.getAttribute("aria-disabled") !== "true")
      .slice(0, 3);
    for (const candidate of candidates) {
      candidate.click();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 80));
        const inputs = queryAllDeep<HTMLInputElement>("input[type=file]");
        if (inputs.length) {
          console.info("[Offer Star][Content] 已展开延迟上传控件", { 控件数量: inputs.length, 等待次数: attempt + 1 });
          return inputs;
        }
      }
    }
    return queryAllDeep<HTMLInputElement>("input[type=file]");
  }

  /** 根据上传控件 accept 属性判断附件是否适配，避免照片和简历文件串控件。 */
  function acceptsFile(input: HTMLInputElement, file: FilePayload) {
    const accept = input.getAttribute("accept")?.trim();
    if (!accept) return true;
    const tokens = accept.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    const name = file.fileName.toLowerCase();
    const mime = file.mimeType.toLowerCase();
    return tokens.some((token) => token === mime || (token.endsWith("/*") && mime.startsWith(token.slice(0, -1))) || (token.startsWith(".") && name.endsWith(token)));
  }

  function writeFilesToInput(input: HTMLInputElement | undefined, files: File[], DataTransferConstructor: typeof DataTransfer | undefined) {
    if (!input) return;
    if (DataTransferConstructor) {
      const transfer = new DataTransferConstructor();
      files.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
    } else {
      // jsdom 等测试环境没有 DataTransfer，用最小 FileList 形状验证业务分支。
      const fileList = { ...Object.fromEntries(files.map((file, index) => [index, file])), length: files.length, item: (index: number) => files[index] ?? null };
      Object.defineProperty(input, "files", { configurable: true, value: fileList });
    }
    const EventConstructor = input.ownerDocument.defaultView?.Event ?? Event;
    input.dispatchEvent(new EventConstructor("input", { bubbles: true }));
    input.dispatchEvent(new EventConstructor("change", { bubbles: true }));
  }

  return { scan, scanDeep, fill, undo, advanceStep, fillPhoto, fillFiles };
}
