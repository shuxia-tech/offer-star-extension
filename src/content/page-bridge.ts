type FieldVm = {
  form?: { setFieldsValue?: (fields: Record<string, unknown>) => void };
  $parent?: FieldVm;
};

type MomentFactory = (input: string) => { _isValid?: boolean };

const trackedClicks = new WeakMap<object, Map<string, number>>();

/** 在页面自己的脚本环境里提交字段。内容脚本读不到 Vue 实例，直接改输入框会被页面清掉。 */
export function installOfferStarPageBridge(doc: Document = document) {
  const view = doc.defaultView as (Window & { __offerStarPageBridge?: boolean; moment?: MomentFactory }) | null;
  if (!view || view.__offerStarPageBridge) return;
  if (import.meta.env.DEV) trackClickListeners(view);
  view.__offerStarPageBridge = true;
  doc.addEventListener("offer-star-activate", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    target.click();
    target.setAttribute("data-offer-star-activated", "1");
  }, true);
  doc.addEventListener("offer-star-inspect-click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const where = nearestTrackedClick(target);
    const found = new Set(describeElementClick(target).split(",").filter(Boolean));
    if (where) found.add("listener");
    target.setAttribute("data-offer-star-click", [...found].join(",") || "none");
    if (where) target.setAttribute("data-offer-star-click-at", where);
    else target.removeAttribute("data-offer-star-click-at");
  }, true);
  doc.addEventListener("offer-star-commit-field", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const raw = target.getAttribute("data-offer-star-pending") ?? "";
    target.removeAttribute("data-offer-star-pending");
    const vm = findFieldVm(target);
    if (!vm?.form?.setFieldsValue) {
      target.setAttribute("data-offer-star-vue", "miss");
      return;
    }
    let next: unknown = raw;
    if (target.getAttribute("data-offer-star-kind") === "date" && typeof view.moment === "function") {
      const parsed = view.moment(raw);
      if (parsed?._isValid) next = parsed;
    }
    try {
      vm.form.setFieldsValue({ value: next });
      target.setAttribute("data-offer-star-vue", "ok");
    } catch {
      target.setAttribute("data-offer-star-vue", "fail");
    }
  });
}

type VueVNode = {
  elm?: Node;
  data?: { on?: Record<string, unknown>; nativeOn?: Record<string, unknown> };
  children?: VueVNode[];
  componentOptions?: { children?: VueVNode[]; listeners?: Record<string, unknown> };
  componentInstance?: { $vnode?: VueVNode; $listeners?: Record<string, unknown> };
};

type VueElement = HTMLElement & {
  __vue__?: { $listeners?: Record<string, unknown>; $vnode?: VueVNode };
  _vei?: Record<string, unknown>;
};

function hasClickRecord(record: Record<string, unknown> | undefined) {
  return Boolean(record && Object.keys(record).some((key) => /click/i.test(key) && record[key]));
}

function vueNodeHasClick(vnode: VueVNode | undefined, element: HTMLElement, seen: Set<VueVNode>, depth: number): boolean {
  if (!vnode || depth > 8 || seen.has(vnode)) return false;
  seen.add(vnode);
  if (vnode.elm === element && (hasClickRecord(vnode.data?.on) || hasClickRecord(vnode.data?.nativeOn) || hasClickRecord(vnode.componentOptions?.listeners))) return true;
  if (vnode.componentInstance && (hasClickRecord(vnode.componentInstance.$listeners) || vueNodeHasClick(vnode.componentInstance.$vnode, element, seen, depth + 1))) return true;
  return (vnode.children ?? []).concat(vnode.componentOptions?.children ?? []).some((child) => vueNodeHasClick(child, element, seen, depth + 1));
}

function reactHasClick(element: HTMLElement) {
  return Object.keys(element).some((key) => {
    if (!key.startsWith("__reactProps$") && !key.startsWith("__reactEventHandlers$")) return false;
    const props = (element as HTMLElement & Record<string, { onClick?: unknown }>)[key];
    return typeof props?.onClick === "function";
  });
}

function captureFlag(options?: boolean | AddEventListenerOptions) {
  return typeof options === "boolean" ? options : Boolean(options?.capture);
}

function canUseAsWeakKey(value: unknown): value is object {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}

function noteListener(target: unknown, type: string, capture: boolean, delta: number) {
  if (type !== "click" || !canUseAsWeakKey(target)) return;
  try {
    const key = capture ? "capture" : "bubble";
    const bag = trackedClicks.get(target) ?? new Map<string, number>();
    const next = (bag.get(key) ?? 0) + delta;
    if (next > 0) bag.set(key, next);
    else bag.delete(key);
    if (bag.size) trackedClicks.set(target, bag);
    else trackedClicks.delete(target);
  } catch {
    // 个别网页会用不能作为 WeakMap 键的值注册事件，记录失败不能打断页面脚本。
  }
}

function trackClickListeners(view: Window) {
  const proto = (view as Window & { EventTarget?: { prototype: EventTarget } }).EventTarget?.prototype;
  if (!proto) return;
  const current = proto.addEventListener as typeof proto.addEventListener & { __offerStarTracked?: boolean };
  if (current.__offerStarTracked) return;
  const originalAdd = proto.addEventListener;
  const originalRemove = proto.removeEventListener;
  const add = function (this: unknown, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (listener) noteListener(this, String(type), captureFlag(options), 1);
    return originalAdd.call(this, type, listener, options);
  };
  add.__offerStarTracked = true;
  proto.addEventListener = add;
  proto.removeEventListener = function (this: unknown, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    if (listener) noteListener(this, String(type), captureFlag(options), -1);
    return originalRemove.call(this, type, listener, options);
  };
}

function nearestTrackedClick(element: HTMLElement) {
  let current: EventTarget | null = element;
  for (let depth = 0; current && depth < 14; depth += 1) {
    const bag = trackedClicks.get(current);
    if (bag && [...bag.values()].some((count) => count > 0)) {
      if (current === element) return "自身";
      if (current instanceof HTMLElement) {
        const className = typeof current.className === "string" ? current.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
        return `父级 ${current.tagName.toLowerCase()}${className ? `.${className}` : ""}`;
      }
      return current === element.ownerDocument ? "document" : "window";
    }
    if (current instanceof HTMLElement) current = current.parentElement ?? current.ownerDocument;
    else if (current === element.ownerDocument) current = element.ownerDocument.defaultView;
    else break;
  }
  return "";
}

/** 报告 onclick、框架绑定，以及本页脚本通过 addEventListener 挂上的 click。 */
export function describeElementClick(element: HTMLElement) {
  const found = new Set<string>();
  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    if (typeof current.onclick === "function" || current.hasAttribute("onclick")) found.add("onclick");
    const vueElement = current as VueElement;
    if (hasClickRecord(vueElement._vei) || hasClickRecord(vueElement.__vue__?.$listeners) || vueNodeHasClick(vueElement.__vue__?.$vnode, element, new Set(), 0)) found.add("vue");
    if (reactHasClick(current)) found.add("react");
    if (current.matches("form, #candidateForm, body")) break;
  }
  return [...found].join(",");
}

function findFieldVm(start: Element) {
  let node: Element | null = start;
  for (let depth = 0; node && depth < 12; depth += 1) {
    let vm = (node as Element & { __vue__?: FieldVm }).__vue__;
    for (let up = 0; vm && up < 8; up += 1) {
      if (typeof vm.form?.setFieldsValue === "function") return vm;
      vm = vm.$parent;
    }
    node = node.parentElement;
  }
  return null;
}
