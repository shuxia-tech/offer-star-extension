import type { DetectedField, FieldValue, FilePayload } from "../shared/messages";
import { guessFieldKey, isBlockedActionLabel, isConsentLabel, isPhoneFieldLabel, sectionAddKeys, sectionKeysFromTitle, shouldFillExistingValue } from "../shared/field-matching";
import { blockedActionTerms, sectionAddRules } from "../shared/field-catalog";
import { createFillHistory } from "../shared/fill-history";
import { getSiteAdapter } from "../shared/site-adapters";
import { validateFieldValue } from "../shared/field-value-validation";
import { choiceCandidates, highestDegreeText } from "../shared/fill-values";
import { sanitizePageUrl } from "../shared/privacy";

export type ScanDebugAddButton = {
  text: string;
  tag: string;
  className: string;
  visible: boolean;
  keys: string;
  onclick: boolean;
  clickListener: string;
};

export type ScanDebugSnapshot = {
  hasCandidateForm: boolean;
  addButtons: ScanDebugAddButton[];
  fieldsAfter: DetectedField[];
  clickedAdds: string[];
};

export type DomEngine = {
  scan(): DetectedField[];
  scanDeep(): Promise<DetectedField[]>;
  fill(values: Record<string, FieldValue>, mode: "incremental" | "overwrite", options?: { debug?: boolean }): Promise<{ filled: string[]; failed: string[]; failureReasons: Record<string, string>; debug?: ScanDebugSnapshot }>;
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
      if (current.style.display.trim() === "none" || current.style.visibility.trim() === "hidden") return true;
      if (current.getAttribute("aria-hidden") === "true" || current.hasAttribute("hidden")) return true;
      const style = ownerWindow(current).getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") return true;
      if (current === element.ownerDocument.body) break;
      current = current.parentElement;
    }
    return false;
  }

  /** 手机号旁边的国家区号下拉不是电话号码本身。区号有时也是输入框，显示 +86。 */
  function isPhoneCountryControl(element: HTMLElement) {
    if (element.tagName === "TEXTAREA") return false;
    if (element.tagName === "INPUT") {
      const dialCode = cleanLabel(element.closest("label")?.querySelector(".sd-Input-display-value")?.textContent ?? "");
      if (/^\+?\d{1,4}$/.test(dialCode)) return true;
      if (hasClassPrefix(element, "code-") && isPhoneFieldLabel(labelFor(element))) return true;
      return false;
    }
    if (element.tagName === "SELECT") return isPhoneFieldLabel(labelFor(element));
    const selectable = element.getAttribute("role") === "combobox" || element.getAttribute("aria-haspopup") === "listbox" || Boolean(element.closest(".ant-select"));
    return selectable && isPhoneFieldLabel(explicitFieldLabel(element));
  }

  function hasClassPrefix(element: HTMLElement, prefix: string) {
    let current: HTMLElement | null = element;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      if (Array.from(current.classList).some((name) => name.startsWith(prefix))) return true;
    }
    return false;
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
    const walked = ancestorFieldLabel(element);
    if (walked) return walked;
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

  function ancestorFieldLabel(element: HTMLElement) {
    let current: HTMLElement | null = element;
    for (let depth = 0; current && depth < 12; depth += 1, current = current.parentElement) {
      const previous = current.previousElementSibling;
      if (!(previous instanceof HTMLElement) || previous.querySelector("input, textarea, select")) continue;
      const text = cleanLabel(previous.textContent ?? "");
      if (text && text.length <= 20 && (guessFieldKey(text).key || /就读时间|在读时间|在校时间|起止年月|实习时间|工作时间|在职时间|任职时间/.test(text))) return (previous.textContent ?? "").trim();
    }
    return "";
  }

  function placeholderSelectTriggers() {
    return queryAllDeep<HTMLElement>("div, span").filter((element) => {
      if (cleanLabel(element.textContent ?? "") !== "请选择") return false;
      if (element.querySelector("input, textarea, select")) return false;
      if (Array.from(element.children).some((child) => cleanLabel(child.textContent ?? "") === "请选择")) return false;
      return !isEffectivelyHidden(element);
    });
  }
  function controls() {
    const form = document.querySelector("#candidateForm");
    if (form) return tupuControls(form);
    const fields = queryAllDeep<HTMLElement>("input:not([type=hidden]), textarea, select, [contenteditable=true], [role=combobox], [role=checkbox], [role=radio], [aria-haspopup=listbox]").filter((element) => !isNoiseControl(element));
    const triggers = placeholderSelectTriggers().filter((element) => !fields.some((field) => field === element || field.contains(element) || element.contains(field)));
    return [...fields, ...triggers];
  }

  /** 图普申请表一行一个字段：用 .field-label 定位，电话取号码框，城市和下拉取选择器。 */
  function tupuControls(form: Element) {
    return Array.from(form.querySelectorAll<HTMLElement>(".field-group")).flatMap((group) => {
      if (isCollapsedGroup(group) || isEffectivelyHidden(group)) return [];
      const control = tupuPrimaryControl(group);
      return control && !isNoiseControl(control) ? [control] : [];
    });
  }

  function tupuPrimaryControl(group: HTMLElement) {
    const label = cleanLabel(group.querySelector(".field-label")?.textContent ?? "");
    if (isPhoneFieldLabel(label)) {
      const phone = group.querySelector<HTMLInputElement>("input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([disabled])");
      if (phone) return phone;
    }
    const cascader = group.querySelector<HTMLElement>(".ant-cascader-picker");
    if (cascader) return cascader;
    const combo = group.querySelector<HTMLElement>("[role=combobox], [aria-haspopup=listbox]");
    if (combo && !isPhoneCountryControl(combo)) return combo;
    const radio = group.querySelector<HTMLInputElement>("input[type=radio]");
    if (radio) return radio;
    const select = group.querySelector<HTMLSelectElement>("select:not([disabled])");
    if (select) return select;
    return group.querySelector<HTMLElement>("textarea, input.ant-calendar-picker-input, input.ant-input:not([disabled]):not([type=hidden]), input:not([disabled]):not([type=hidden]):not([type=radio]):not([type=checkbox])");
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
        if (isConsentLabel(labelText)) return false;
        const shouldCheck = ["true", "1", "yes", "y", "是", "有", "同意", "已婚"].includes(value.trim().toLowerCase());
        input.checked = shouldCheck;
      }
    } else if (["checkbox", "radio"].includes(element.getAttribute("role") ?? "")) {
      const role = element.getAttribute("role");
      const labelText = element.getAttribute("aria-label") ?? element.textContent ?? element.parentElement?.textContent ?? "";
      if (role === "checkbox") {
        if (isConsentLabel(labelText)) return false;
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
      const wanted = select.multiple ? value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean) : choiceCandidates(value);
      let matched: HTMLOptionElement[] = [];
      // 原生级联下拉的 option 可能由接口异步插入，有限等待后再判定失败。
      for (let attempt = 0; attempt < 8 && !matched.length; attempt += 1) {
        matched = Array.from(select.options).filter((item) => wanted.some((target) => optionMatches(item.textContent ?? "", item.value, target)));
        if (!matched.length && attempt < 7) await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      if (!matched.length) return false;
      if (select.multiple) {
        Array.from(select.options).forEach((item) => { item.selected = matched.includes(item); });
      } else {
        select.value = matched[0].value;
      }
    } else if (element.classList.contains("ant-cascader-picker")) {
      return fillAntCascader(element, value);
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
      const candidates = [...choiceCandidates(value), ...dateCandidates(value)];
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
      pageValueSetter(element as HTMLInputElement)?.call(element, formatted);
    } else if (await pickPlaceholderOption(element, value)) {
      return true;
    } else if (isSugarSelect(element)) {
      return false;
    } else {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      const inputType = element.tagName === "INPUT" ? (input as HTMLInputElement).type : "";
      const normalizedValue = inputType === "date" || inputType === "month" ? normalizeDateValue(value, inputType) : normalizePhoneValue(element, value);
      await writeFrameworkText(input, normalizedValue);
      return true;
    }
    const EventConstructor = ownerWindow(element).Event;
    element.dispatchEvent(new EventConstructor("input", { bubbles: true }));
    element.dispatchEvent(new EventConstructor("change", { bubbles: true }));
    element.dispatchEvent(new EventConstructor("blur", { bubbles: true }));
    return true;
  }

  function pageValueSetter(element: HTMLInputElement | HTMLTextAreaElement) {
    const view = ownerWindow(element);
    const prototype = element.tagName === "TEXTAREA" ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
    return Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  }

  /** 用页面自己的 value 赋值，再补一次 keyup，让 Vue 表单接住输入。 */
  async function writeFrameworkText(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    element.focus();
    pageValueSetter(element)?.call(element, value);
    const view = ownerWindow(element);
    element.dispatchEvent(new view.Event("input", { bubbles: true }));
    element.dispatchEvent(new view.KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }));
    if (element.classList.contains("ant-input") || element.closest(".ant-form, #candidateForm")) commitVueValue(element, value, true);
    element.dataset.offerStarAutofillUsed = "1";
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
  }

  async function fillAntCascader(element: HTMLElement, value: string) {
    element.click();
    const parts = value.split(/[/／]+/).map((item) => cleanLabel(item)).filter(Boolean);
    const steps = parts.length ? parts : [cleanLabel(value)];
    for (const step of steps) {
      let item: HTMLElement | undefined;
      for (let attempt = 0; attempt < 8 && !item; attempt += 1) {
        item = queryAllDeep<HTMLElement>(".ant-cascader-menu-item").find((option) => cleanLabel(option.textContent ?? "").includes(step) && !isEffectivelyHidden(option));
        if (!item) await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      if (!item) return false;
      item.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    element.dataset.offerStarAutofillUsed = "1";
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

  function optionMatches(text: string, optionValue: string, target: string) {
    const clean = cleanLabel(text);
    const wanted = cleanLabel(target);
    if (!wanted) return false;
    return clean === wanted || optionValue === target || clean.includes(wanted) || (wanted.length <= 8 && clean.length >= 2 && clean.length <= 8 && wanted.includes(clean));
  }

  function classHas(element: Element, fragment: string) {
    return Array.from(element.classList).some((name) => name.includes(fragment));
  }

  function closestClass(element: HTMLElement, fragment: string) {
    let current: HTMLElement | null = element;
    while (current) {
      if (classHas(current, fragment)) return current;
      current = current.parentElement;
    }
    return null;
  }

  /** Sugar 的类名带哈希，例如 sd-Select-container-1Eq4x，不能用精确类名。 */
  function isSugarSelect(element: HTMLElement) {
    return Boolean(closestClass(element, "sd-Select"));
  }

  function isChoiceControl(element: HTMLElement) {
    if (isPhoneFieldLabel(labelFor(element)) || isPhoneCountryControl(element)) return false;
    if (isSugarSelect(element)) return true;
    const placeholder = ((element as HTMLInputElement).placeholder ?? "").trim();
    if (placeholder === "年" || placeholder === "月" || /^请选择/.test(placeholder)) return true;
    const text = cleanLabel(element.textContent ?? "");
    return text === "请选择" || text === "年" || text === "月" || Boolean(element.closest(".el-select, .ant-select, .ivu-select, .n-select"));
  }

  function selectCandidates(value: string) {
    const found = new Set(choiceCandidates(value));
    if (/^\d{1,2}$/.test(value.trim())) {
      const month = String(Number(value));
      [month, month.padStart(2, "0"), `${month}月`].forEach((item) => found.add(item));
    }
    if (/至今|present|在职/i.test(value)) ["至今", "在读", "Present"].forEach((item) => found.add(item));
    return [...found];
  }

  function choiceNodes(element: HTMLElement, candidates: string[]) {
    const widget = element.closest(".el-select, .ant-select, .ivu-select, .n-select") ?? element.parentElement ?? element;
    const scopes: Element[] = [widget];
    if (widget.parentElement) scopes.push(widget.parentElement);
    if (widget.nextElementSibling) scopes.push(widget.nextElementSibling);
    if (widget.parentElement?.nextElementSibling) scopes.push(widget.parentElement.nextElementSibling);
    queryAllDeep<HTMLElement>("[class*='dropdown'], [class*='Dropdown'], [class*='popup'], [class*='Popup'], [role='listbox']").forEach((panel) => {
      if (isVisible(panel)) scopes.push(panel);
    });
    const local = scopes.flatMap((scope) => Array.from(scope.querySelectorAll<HTMLElement>("li, [role=option], div, span")));
    const listed = queryAllDeep<HTMLElement>("li, [role=option], div, span").filter((item) => {
      if (!isVisible(item)) return false;
      const text = cleanLabel(item.textContent ?? "");
      if (!candidates.some((candidate) => cleanLabel(candidate) === text)) return false;
      const siblings = Array.from(item.parentElement?.children ?? []).filter((child) => cleanLabel(child.textContent ?? "").length <= 12);
      return siblings.length >= 2;
    });
    return [...local, ...listed];
  }

  /** 已经选中的 Sugar 值在展示层，输入框 value 一直是空的。带错误或 ghost 时视为还没提交。 */
  function sugarCommittedText(element: HTMLElement) {
    const select = closestClass(element, "sd-Select");
    if (!select) return "";
    const display = select.querySelector<HTMLElement>("[class*='sd-Input-display-value']");
    if (!display) return "";
    const ghost = Array.from(display.querySelectorAll("*")).some((node) => node instanceof HTMLElement && classHas(node, "ghost"));
    if (ghost || classHas(select, "sd-Input-error")) return "";
    const text = cleanLabel(display.textContent ?? "");
    if (!text || text === "年" || text === "月" || text === "请选择") return "";
    return text;
  }

  /** 点开「请选择 / 年 / 月」下拉，只在当前下拉列表里点中对应项。手机号输入框不走这里。 */
  async function pickPlaceholderOption(element: HTMLElement, value: string) {
    if (!isChoiceControl(element)) return false;
    const sugar = isSugarSelect(element);
    const candidates = selectCandidates(value);
    if (sugar) pressControl(element);
    else {
      const box = element.parentElement;
      if (box && box !== element.ownerDocument.body) activateControl(box);
      activateControl(element);
    }
    const attempts = sugar ? 12 : 8;
    let option: HTMLElement | undefined;
    for (let attempt = 0; attempt < attempts && !option; attempt += 1) {
      option = (sugar ? findSugarOption(element, candidates) : undefined) ?? pickExactOption(choiceNodes(element, candidates), candidates);
      if (!option) await new Promise<void>((resolve) => setTimeout(resolve, sugar ? 40 : 25));
    }
    if (!option) return false;
    const row = closestClass(option, "sd-Menu-container") ?? option;
    revealOption(row);
    if (closestClass(row, "sd-Menu-container")) pressControl(row);
    else activateControl(row);
    element.dataset.offerStarAutofillUsed = "1";
    return true;
  }

  function findSugarOption(element: HTMLElement, candidates: string[]) {
    const host = closestClass(element, "sd-Dropdown-container") ?? closestClass(element, "sd-Select")?.parentElement ?? undefined;
    const local = host ? Array.from(host.querySelectorAll<HTMLElement>("[data-key='sugar.select.label']")) : [];
    const labels = [...local, ...queryAllDeep<HTMLElement>("[data-key='sugar.select.label']")];
    const label = labels.find((item) => {
      if (!isVisible(item)) return false;
      const menu = closestClass(item, "sd-Dropdown-dropdown") ?? closestClass(item, "sd-Select-menu");
      if (menu && !isVisible(menu)) return false;
      const text = cleanLabel(item.textContent ?? "");
      return candidates.some((candidate) => cleanLabel(candidate) === text);
    });
    return label ? closestClass(label, "sd-Menu-container") ?? undefined : undefined;
  }

  function revealOption(option: HTMLElement) {
    const scroller = closestClass(option, "sd-Select-scrollable");
    if (scroller) scroller.scrollTop = Math.max(0, option.offsetTop - scroller.clientHeight / 2);
    if (typeof option.scrollIntoView === "function") option.scrollIntoView({ block: "center" });
  }

  function pressControl(element: HTMLElement) {
    const view = ownerWindow(element);
    element.dispatchEvent(new view.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new view.MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    activateControl(element);
  }

  function pickExactOption(pool: HTMLElement[], candidates: string[]) {
    const matches = pool.filter((item) => {
      if (!isVisible(item) || closestClass(item, "sd-Input-display-value")) return false;
      if (optionScore(item.textContent ?? "", item.getAttribute("data-value") ?? "", candidates) < 3) return false;
      return !Array.from(item.children).some((child) => child instanceof HTMLElement && optionScore(child.textContent ?? "", "", candidates) >= 3);
    });
    return matches[0];
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
    if (group?.querySelector("[role=combobox], .ant-select") && isPhoneFieldLabel(explicitFieldLabel(element))) {
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
    if (isSugarSelect(element) && element.tagName === "INPUT") return sugarCommittedText(element);
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

  function dateSections() {
    const titles = queryAllDeep<HTMLElement>("span, div, label").filter(isDateTitle).sort(compareTopToBottom);
    const sections: Array<{ root: HTMLElement; kind: string; row: number; inputs: HTMLElement[] }> = [];
    let educationRow = 0;
    let workRow = 0;
    for (let index = 0; index < titles.length; index += 1) {
      const title = titles[index];
      const kind = splitDateKind(cleanLabel(title.textContent ?? ""));
      const inputs = dateInputsBetween(title, titles[index + 1]);
      if (inputs.length < 2) continue;
      sections.push({ root: title, kind, row: kind === "education" ? educationRow++ : workRow++, inputs });
    }
    return sections.sort((left, right) => compareTopToBottom(left.inputs[0], right.inputs[0]));
  }

  function isDateTitle(title: HTMLElement) {
    const label = cleanLabel(title.textContent ?? "");
    if (!splitDateKind(label) || label.length > 12) return false;
    return !Array.from(title.children).some((child) => splitDateKind(cleanLabel(child.textContent ?? "")));
  }

  function dateInputsBetween(title: HTMLElement, next?: HTMLElement) {
    const following = queryAllDeep<HTMLInputElement>("input").filter((input) => {
      const placeholder = input.placeholder.trim();
      if (placeholder !== "年" && placeholder !== "月" && !isSugarSelect(input)) return false;
      if ((title.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) return false;
      if (next && (input.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) return false;
      return true;
    });
    const ranged = following.filter((input) => input.closest("[class*='month-range']"));
    const picked = ranged.length >= 4 ? ranged : following;
    return picked.length > 4 ? picked.slice(0, 4) : picked;
  }

  async function fillDateSection(section: { kind: string; row: number; inputs: HTMLElement[] }, values: Record<string, FieldValue>) {
    const startKey = section.kind === "education" ? "educationStartDate" : "startDate";
    const endKey = section.kind === "education" ? "educationEndDate" : "endDate";
    const start = dateParts(valueAt(values[startKey], section.row));
    const end = section.inputs.length >= 4 ? dateParts(valueAt(values[endKey], section.row)) : null;
    let ok = true;
    if (start) {
      if (!(await assignChoice(section.inputs[0], start.year))) ok = false;
      if (start.month && section.inputs[1] && !(await assignChoice(section.inputs[1], start.month))) ok = false;
    }
    if (end && section.inputs[2]) {
      if (!(await assignChoice(section.inputs[2], end.year))) ok = false;
      if (end.month && section.inputs[3] && !(await assignChoice(section.inputs[3], end.month))) ok = false;
    }
    return ok;
  }

  async function assignChoice(input: HTMLElement | undefined, value: string) {
    if (!input || !value) return true;
    if (sameChoice(input, value)) return true;
    return pickPlaceholderOption(input, value);
  }

  function sameChoice(element: HTMLElement, expected: string) {
    const current = cleanLabel(currentValue(element));
    if (!current) return false;
    return selectCandidates(expected).some((candidate) => cleanLabel(candidate) === current);
  }

  function splitDateKind(label: string) {
    if (/就读时间|在读时间|在校时间|起止年月/.test(label)) return "education";
    if (/实习时间|工作时间|在职时间|任职时间/.test(label)) return "work";
    return "";
  }

  function valueAt(value: FieldValue | undefined, index: number) {
    if (Array.isArray(value)) return String(value[index] ?? "");
    return index === 0 ? String(value ?? "") : "";
  }

  function dateParts(value: string) {
    const trimmed = value.trim();
    if (/至今|present|在职/i.test(trimmed)) return { year: "至今", month: "" };
    const match = trimmed.match(/(\d{4})\D+(\d{1,2})/);
    if (!match) return null;
    return { year: match[1], month: String(Number(match[2])) };
  }

  async function expandRepeatedSections(values: Record<string, FieldValue>, clickedAdds: string[]) {
    let added = 0;
    for (const rule of sectionAddRules) {
      const requested = Math.max(...rule.keys.map((key) => entryCount(values[key])), 0);
      if (requested < 1) continue;
      let current = sectionFieldCount(rule.keys);
      let attempts = 0;
      while (current < requested && attempts < requested) {
        const label = addSectionControls(rule.keys)[0];
        if (!label) break;
        const trigger = activationTarget(label);
        activateControl(trigger);
        clickedAdds.push(cleanLabel(trigger.textContent ?? "") || rule.terms[0]);
        const next = await waitForSectionGrowth(rule.keys, current);
        if (next <= current) break;
        added += next - current;
        current = next;
        attempts += 1;
      }
    }
    return added;
  }

  function activateControl(element: HTMLElement) {
    element.dispatchEvent(new CustomEvent("offer-star-activate", { bubbles: true }));
    if (element.getAttribute("data-offer-star-activated") === "1") {
      element.removeAttribute("data-offer-star-activated");
      return;
    }
    element.click();
  }

  function entryCount(value: FieldValue | undefined) {
    if (Array.isArray(value)) return value.filter((item) => String(item ?? "").trim()).length;
    return String(value ?? "").trim() ? 1 : 0;
  }

  function sectionFieldCount(keys: readonly string[]) {
    const anchor = keys[0];
    return scan().filter((field) => field.key === anchor).length;
  }

  function addSectionControls(keys: readonly string[]) {
    return queryAllDeep<HTMLElement>("button, [role=button], a").filter((element) => {
      if (element.closest("button") && element.tagName !== "BUTTON") return false;
      const text = cleanLabel(element.textContent ?? "");
      if (text.length > 24 || isBlockedActionLabel(text) || !isVisible(element)) return false;
      const matched = sectionAddKeys(text) ?? bareAddKeys(element);
      return Boolean(matched) && matched!.join(",") === keys.join(",");
    }).sort((left, right) => Number(right.classList.contains("add_btn")) - Number(left.classList.contains("add_btn")));
  }

  function bareAddKeys(element: HTMLElement) {
    const text = normalizeAddText(element.textContent ?? "");
    if (!/^(\+|＋)?(添加|新增|继续添加)$/.test(text)) return null;
    let current: HTMLElement | null = element;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      const previous = current.previousElementSibling;
      const keys = previous ? sectionKeysFromTitle(previous.textContent ?? "") : null;
      if (keys) return keys;
    }
    return null;
  }

  function normalizeAddText(label: string) {
    return label.replace(/[\s*＊]/g, "");
  }

  /** 文案本身往往没有点击逻辑，真正的按钮或点击事件在它的祖先上。 */
  function activationTarget(element: HTMLElement) {
    let current: HTMLElement | null = element;
    let pointerTarget: HTMLElement | null = null;
    for (let depth = 0; current && depth < 8; current = current.parentElement, depth += 1) {
      if (current.matches("button, [role=button], a, .ant-btn")) return current;
      if (typeof current.onclick === "function" || current.hasAttribute("onclick")) return current;
      const cursor = ownerWindow(current).getComputedStyle(current).cursor;
      if (cursor === "pointer" && !pointerTarget) pointerTarget = current;
      if (current.matches("form, #candidateForm, body")) break;
    }
    return pointerTarget ?? element;
  }

  async function waitForSectionGrowth(keys: readonly string[], previous: number) {
    const pauses = /jsdom/i.test(ownerWindow(document.documentElement).navigator?.userAgent ?? "") ? [0] : [0, 80, 240, 600];
    let count = previous;
    for (const pause of pauses) {
      if (pause) await new Promise<void>((resolve) => setTimeout(resolve, pause));
      count = sectionFieldCount(keys);
      if (count > previous) return count;
    }
    return count;
  }

  function clearAddButtonMarks() {
    document.querySelectorAll<HTMLElement>("[data-offer-star-add-mark]").forEach((element) => {
      element.style.removeProperty("outline");
      element.style.removeProperty("outline-offset");
      element.removeAttribute("data-offer-star-add-mark");
    });
  }

  function readClickBinding(element: HTMLElement) {
    element.dispatchEvent(new CustomEvent("offer-star-inspect-click", { bubbles: true }));
    const reported = element.getAttribute("data-offer-star-click") ?? "";
    const where = element.getAttribute("data-offer-star-click-at") ?? "";
    element.removeAttribute("data-offer-star-click");
    element.removeAttribute("data-offer-star-click-at");
    const onclick = reported.split(",").includes("onclick") || typeof element.onclick === "function" || element.hasAttribute("onclick");
    const parts = reported.split(",").filter(Boolean);
    const labels = parts.map((part) => part === "vue" ? "Vue click" : part === "react" ? "React onClick" : part === "onclick" ? "onclick" : part === "listener" ? `click 监听（${where || "已挂上"}）` : "").filter(Boolean);
    if (onclick && !labels.includes("onclick")) labels.unshift("onclick");
    return { onclick, clickListener: labels.length ? `识别到 ${labels.join("、")}` : "未识别到" };
  }

  function listAddButtons(): ScanDebugAddButton[] {
    clearAddButtonMarks();
    return queryAllDeep<HTMLElement>("button, [role=button], a, div, span").flatMap((element) => {
      const text = cleanLabel(element.textContent ?? "");
      const keys = sectionAddKeys(text);
      if (!keys || text.length > 40) return [];
      if (Array.from(element.children).some((child) => sectionAddKeys(cleanLabel(child.textContent ?? "")))) return [];
      const visible = !isEffectivelyHidden(element);
      const binding = readClickBinding(element);
      return [{
        text,
        tag: element.tagName.toLowerCase(),
        className: String(element.className || "").slice(0, 80),
        visible,
        keys: keys.join(","),
        onclick: binding.onclick,
        clickListener: binding.clickListener
      }];
    });
  }

  function fieldAt(currentFields: DetectedField[], occurrence: number) {
    const grouped = currentFields.find((field) => controls()[field.elementIndex]?.closest("[groupindex]")?.getAttribute("groupindex") === String(occurrence));
    if (grouped) return grouped;
    const hasGroups = currentFields.some((field) => controls()[field.elementIndex]?.closest("[groupindex]"));
    return hasGroups ? undefined : currentFields[occurrence];
  }

  function compareTopToBottom(left: HTMLElement, right: HTMLElement) {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    if (Math.abs(leftRect.top - rightRect.top) > 1) return leftRect.top - rightRect.top;
    if (Math.abs(leftRect.left - rightRect.left) > 1) return leftRect.left - rightRect.left;
    const position = left.compareDocumentPosition(right);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  async function writeFields(values: Record<string, FieldValue>, mode: "incremental" | "overwrite", filled: string[], failed: string[], failureReasons: Record<string, string>, only?: Set<string>) {
    const misses: string[] = [];
    const seen = new Map<string, number>();
    const degreeCount = scan().filter((item) => item.key === "degree").length;
    const sections = dateSections();
    const sectionInputs = new Set(sections.flatMap((section) => section.inputs));
    const started = new Set<HTMLElement>();
    const ordered = scan().flatMap((field) => {
      const element = controls()[field.elementIndex];
      return element ? [{ field, element }] : [];
    }).sort((left, right) => compareTopToBottom(left.element, right.element));
    for (const item of ordered) {
      const section = sections.find((entry) => entry.inputs.includes(item.element));
      if (section) {
        const startKey = section.kind === "education" ? "educationStartDate" : "startDate";
        const endKey = section.kind === "education" ? "educationEndDate" : "endDate";
        seen.set(startKey, (seen.get(startKey) ?? 0) + 1);
        seen.set(endKey, (seen.get(endKey) ?? 0) + 1);
        if ((!only || dateSectionSelected(section, only)) && !started.has(section.root)) {
          started.add(section.root);
          const filledDate = await fillDateSection(section, values);
          if (!filledDate) {
            const failedKey = `${startKey}[${section.row + 1}]`;
            failed.push(failedKey);
            failureReasons[failedKey] = "时间下拉没有点中对应的年或月";
            misses.push(failedKey);
          }
        }
        continue;
      }
      if (!item.field.key || item.field.key === "photo" || item.field.key === "attachment") continue;
      if (sectionInputs.has(item.element)) continue;
      const key = item.field.key;
      const occurrence = seen.get(key) ?? 0;
      seen.set(key, occurrence + 1);
      const raw = values[key];
      const listed = Array.isArray(raw) ? raw : [raw];
      const text = key === "degree" && degreeCount <= 1
        ? highestDegreeText(listed.map((entry) => String(entry ?? ""))) || String(listed[0] ?? "")
        : valueAt(raw, occurrence);
      const failedKey = Array.isArray(raw) && !(key === "degree" && degreeCount <= 1) ? `${key}[${occurrence + 1}]` : key;
      if (only && !only.has(failedKey)) continue;
      if (!text.trim()) continue;
      const validationError = validateFieldValue(key, text);
      if (validationError) {
        failed.push(failedKey);
        failureReasons[failedKey] = validationError;
        continue;
      }
      const element = liveControl(key, occurrence) ?? item.element;
      if (!element.isConnected) {
        failed.push(failedKey);
        failureReasons[failedKey] = "没有找到对应页面控件";
        misses.push(failedKey);
        continue;
      }
      const previousValue = currentValue(element);
      if (previousValue && !shouldFillExistingValue(mode, previousValue)) continue;
      if (await setValue(element, text)) {
        fillHistory.add({ target: element, value: previousValue });
        filled.push(key);
      } else {
        failed.push(failedKey);
        failureReasons[failedKey] = "控件不支持该值或候选项未匹配";
        misses.push(failedKey);
      }
    }
    for (const [key, raw] of Object.entries(values)) {
      if (key === "photo" || key === "attachment" || seen.has(key)) continue;
      if (scan().some((item) => item.key === key)) continue;
      const present = Array.isArray(raw) ? raw.some((entry) => String(entry ?? "").trim()) : String(raw ?? "").trim();
      if (!present) continue;
      if (only && !only.has(key)) continue;
      failed.push(key);
      failureReasons[key] = "没有找到对应页面控件";
      misses.push(key);
    }
    return misses;
  }

  function dateSectionSelected(section: { kind: string; row: number }, only: Set<string>) {
    const start = section.kind === "education" ? "educationStartDate" : "startDate";
    const end = section.kind === "education" ? "educationEndDate" : "endDate";
    const row = String(section.row + 1);
    return [start, end, `${start}[${row}]`, `${end}[${row}]`].some((key) => only.has(key));
  }

  function liveControl(key: string, occurrence: number) {
    const fields = scan().filter((item) => item.key === key);
    const field = fieldAt(fields, occurrence);
    return field ? controls()[field.elementIndex] : undefined;
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

  async function fill(values: Record<string, FieldValue>, mode: "incremental" | "overwrite", options?: { debug?: boolean }) {
    const filled: string[] = [];
    const failed: string[] = [];
    const failureReasons: Record<string, string> = {};
    const clickedAdds: string[] = [];
    fillHistory.reset();
    await expandRepeatedSections(values, clickedAdds);
    const misses = await writeFields(values, mode, filled, failed, failureReasons);
    const added = await expandRepeatedSections(values, clickedAdds);
    if (misses.length || added) {
      if (added) {
        failed.splice(0, failed.length);
        for (const key of Object.keys(failureReasons)) delete failureReasons[key];
      } else {
        for (const miss of misses) {
          const index = failed.indexOf(miss);
          if (index >= 0) failed.splice(index, 1);
          delete failureReasons[miss];
        }
      }
      await writeFields(values, mode, filled, failed, failureReasons, added ? undefined : new Set(misses));
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await confirmEditedSegments();
    if (failed.length) console.warn("[Offer Star][Content] 填写失败明细", { 失败数量: failed.length });
    return {
      filled,
      failed,
      failureReasons,
      debug: options?.debug ? { hasCandidateForm: Boolean(document.querySelector("#candidateForm")), addButtons: listAddButtons(), fieldsAfter: scan(), clickedAdds } : undefined
    };
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
    const blockedPattern = new RegExp(blockedActionTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
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
