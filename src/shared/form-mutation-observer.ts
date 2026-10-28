function isStructuralFormChange(mutations: MutationRecord[]) {
  return mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = node as Element;
    const noise = ".ant-select-dropdown, .ant-calendar-picker-container, .ant-message, .ant-notification";
    if (element.matches(`script, style, link, ${noise}`)) return false;
    return !element.closest(noise);
  }));
}

/** 监听表单结构变化；只观察子节点变化，避免输入值变化造成频繁提示。 */
export function installFormMutationObserver(document: Document, onChange: () => void, isSuppressed: () => boolean, debounceMs = 250) {
  if (!document.body || typeof MutationObserver === "undefined") return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  const observer = new MutationObserver((mutations) => {
    if (isSuppressed()) {
      pending = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
      return;
    }
    if (!isStructuralFormChange(mutations)) return;
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (isSuppressed() || !pending) {
        pending = false;
        return;
      }
      pending = false;
      onChange();
    }, debounceMs);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    if (timer) clearTimeout(timer);
  };
}
