import { detectSecurityChallenge } from "../shared/security-page";

export type PreviewFillResult = { filled: boolean; changed?: boolean; error?: string };
type Target = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

/** 只保存用户刚选中的控件，不通过字段猜测选择另一个输入框。 */
export function createPreviewTextFill(rootDocument: Document) {
  let selected: Target | null = null;
  let selectedUrl = "";
  let keyboardFocusUntil = 0;
  const watched = new WeakSet<Node>();
  const cleanups: Array<() => void> = [];
  const pageUrl = () => rootDocument.defaultView?.location.href || rootDocument.URL;
  const error = (message: string): PreviewFillResult => ({ filled: false, error: message });
  const candidate = (event: Event) => event.composedPath().find((node): node is HTMLElement => Boolean(node && typeof (node as HTMLElement).matches === "function" && (node as HTMLElement).matches("input,textarea,select,[contenteditable]"))) ?? null;
  function remember(event: Event) {
    if (!event.isTrusted) return;
    if (event.type === "focusin" && Date.now() > keyboardFocusUntil) return;
    const target = candidate(event);
    if (target && !target.closest("#offer-star-floating-panel,#offer-star-floating-launcher")) { selected = target; selectedUrl = pageUrl(); }
  }
  function watch(root: Document | ShadowRoot) {
    if (watched.has(root)) return;
    watched.add(root);
    const onKey = (event: Event) => { if (event.isTrusted && (event as KeyboardEvent).key === "Tab") keyboardFocusUntil = Date.now() + 500; };
    root.addEventListener("pointerdown", remember, true);
    root.addEventListener("focusin", remember, true);
    root.addEventListener("keydown", onKey, true);
    cleanups.push(() => { root.removeEventListener("pointerdown", remember, true); root.removeEventListener("focusin", remember, true); root.removeEventListener("keydown", onKey, true); });
    const visit = (scope: ParentNode) => {
      const nodes = (scope as Node).nodeType === 1 ? [scope as Element, ...scope.querySelectorAll("*")] : [...scope.querySelectorAll("*")];
      for (const node of nodes) {
        if (node.shadowRoot) watch(node.shadowRoot);
        if (node.tagName !== "IFRAME" || watched.has(node)) continue;
        watched.add(node);
        const attach = () => { try { const document = (node as HTMLIFrameElement).contentDocument; if (document) watch(document); } catch { /* 跨域框架保持浏览器隔离，不读取其中内容。 */ } };
        attach(); node.addEventListener("load", attach); cleanups.push(() => node.removeEventListener("load", attach));
      }
    };
    visit(root);
    const Observer = rootDocument.defaultView!.MutationObserver;
    const observer = new Observer((records) => { for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) visit(node as Element); });
    observer.observe(root, { childList: true, subtree: true }); cleanups.push(() => observer.disconnect());
  }
  watch(rootDocument);
  const onBlur = () => { setTimeout(() => { const active=rootDocument.activeElement; if(active?.tagName!=="IFRAME" || active.id==="offer-star-floating-panel-frame")return;try { if(!(active as HTMLIFrameElement).contentDocument)selected=null; }catch{selected=null;} },0); };
  rootDocument.defaultView?.addEventListener("blur",onBlur);cleanups.push(()=>rootDocument.defaultView?.removeEventListener("blur",onBlur));
  function connected(target: Target) {
    if (!target.isConnected) return false;
    let document = target.ownerDocument;
    while (document !== rootDocument) {
      const frame = document.defaultView?.frameElement;
      if (!frame?.isConnected) return false;
      document = frame.ownerDocument;
    }
    return true;
  }
  function normalize(value: string, type: string) {
    if (!["date", "month"].includes(type)) return value;
    const match = value.trim().match(/^(\d{4})[年/.-](\d{1,2})(?:[月/.-](\d{1,2})日?)?$/);
    if (!match) return value;
    return `${match[1]}-${match[2].padStart(2,"0")}${type === "date" && match[3] ? "-" + match[3].padStart(2,"0") : ""}`;
  }
  function fill(value: unknown): PreviewFillResult {
    if (typeof value !== "string" || !value.trim()) return error("这项信息没有可填入的文字");
    if (value.length > 20000) return error("文字较长，请单击复制后分段填写");
    if (detectSecurityChallenge(rootDocument, pageUrl())) return error("当前页面需要完成安全验证，请完成后再填写");
    const target = selected;
    if (!target || !connected(target) || selectedUrl !== pageUrl()) { selected = null; return error("请先点击网页中需要填写的输入框，再双击简历信息"); }
    if (detectSecurityChallenge(target.ownerDocument, target.ownerDocument.URL)) return error("当前输入框所在页面需要完成安全验证");
    if (target.matches(":disabled,[readonly],[aria-disabled=true],[aria-readonly=true]") || target.closest("[hidden],[inert]")) return error("该输入框不可编辑，请重新选择");
    const view = target.ownerDocument.defaultView!;
    for(let node: Element|null=target;node;node=node.parentElement??(node.getRootNode() as ShadowRoot).host??null){const style=view.getComputedStyle(node);if(style.display==="none"||style.visibility==="hidden")return error("原输入框已隐藏，请重新选择");}
    const input = target.tagName === "INPUT" ? target as HTMLInputElement : null;
    const textarea = target.tagName === "TEXTAREA" ? target as HTMLTextAreaElement : null;
    const editable = !input && !textarea && target.getAttribute("contenteditable") !== "false" && (target.isContentEditable || target.getAttribute("contenteditable") === "true" || target.getAttribute("contenteditable") === "plaintext-only");
    if (input && !["text","search","email","url","tel","number","date","month","time","datetime-local","week"].includes(input.type) || !input && !textarea && !editable) return error("请选择文字输入框或文本编辑区；密码、文件和选项控件不能直接填入");
    if (input && /(?:one-time-code|cc-number|cc-csc|current-password|new-password)/i.test(input.autocomplete)) return error("此类敏感输入框请在网页中手动填写");
    const text = normalize(value, input?.type ?? "");
    if ((input || textarea) && (target as HTMLInputElement).maxLength >= 0 && text.length > (target as HTMLInputElement).maxLength) return error("文字超过该输入框的字数限制，请单击复制后调整");
    if (input) {
      const probe = target.ownerDocument.createElement("input"); probe.type = input.type;
      for (const name of ["pattern","min","max","step"]) if (input.hasAttribute(name)) probe.setAttribute(name,input.getAttribute(name)!);
      probe.value = text;
      if (!probe.value || !probe.validity.valid) return error("文字与该输入框的格式不匹配，请单击复制后调整");
    }
    const before = input || textarea ? (target as HTMLInputElement).value : target.textContent ?? "";
    if (before === text) return { filled: true, changed: false };
    const beforeInput = new view.InputEvent("beforeinput", { bubbles: true, composed: true, cancelable: true, inputType: "insertReplacementText", data: text });
    if (!target.dispatchEvent(beforeInput)) return error("网页暂不允许修改该输入框，请手动填写");
    if (!connected(target) || selectedUrl !== pageUrl() || target.matches(":disabled,[readonly]")) return error("输入框状态已变化，请重新选择后填写");
    target.focus();
    if (input || textarea) {
      const prototype = textarea ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype,"value")?.set?.call(target,text);
    } else target.textContent = text;
    target.dispatchEvent(new view.InputEvent("input", { bubbles: true, composed: true, inputType: "insertReplacementText", data: text }));
    target.dispatchEvent(new view.Event("change", { bubbles: true, composed: true }));
    target.dispatchEvent(new view.KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }));
    return { filled: true, changed: true };
  }
  return { fill, clear: () => { selected = null; }, dispose: () => { selected = null; cleanups.forEach(cleanup=>cleanup()); } };
}
