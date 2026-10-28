type FieldVm = {
  form?: { setFieldsValue?: (fields: Record<string, unknown>) => void };
  $parent?: FieldVm;
};

type MomentFactory = (input: string) => { _isValid?: boolean };

/** 在页面自己的脚本环境里提交字段。内容脚本读不到 Vue 实例，直接改输入框会被页面清掉。 */
export function installOfferStarPageBridge(doc: Document = document) {
  const view = doc.defaultView as (Window & { __offerStarPageBridge?: boolean; moment?: MomentFactory }) | null;
  if (!view || view.__offerStarPageBridge) return;
  view.__offerStarPageBridge = true;
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
