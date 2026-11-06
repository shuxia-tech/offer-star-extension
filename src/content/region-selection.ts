export type FillRegion = { left: number; top: number; right: number; bottom: number };

/** 以控件中心判断是否选中；同源 iframe 换算到顶层坐标，跨域内容保持隔离。 */
export function isInsideRegion(element: HTMLElement, region: FillRegion) {
  const rect = element.getBoundingClientRect();
  if (!element.isConnected || rect.width <= 0 || rect.height <= 0) return false;
  let x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  let view = element.ownerDocument.defaultView;
  try {
    while (view?.frameElement) {
      const frame = view.frameElement as HTMLElement;
      const bounds = frame.getBoundingClientRect();
      const scaleX = bounds.width / (frame.offsetWidth || bounds.width || 1);
      const scaleY = bounds.height / (frame.offsetHeight || bounds.height || 1);
      x = bounds.left + (frame.clientLeft + x) * scaleX;
      y = bounds.top + (frame.clientTop + y) * scaleY;
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return false;
      view = frame.ownerDocument.defaultView;
    }
  } catch { return false; }
  return x >= region.left && x <= region.right && y >= region.top && y <= region.bottom;
}

/** 覆盖层只拦截选区手势，不把拖动或点击传给招聘页面。 */
export function createRegionSelector(document: Document) {
  let cancel: (() => void) | undefined;
  return {
    cancel: () => cancel?.(),
    select: () => {
      cancel?.();
      return new Promise<FillRegion | null>((resolve) => {
        const view = document.defaultView!;
        const host = document.createElement("div"); host.id = "offer-star-region-selector";
        host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;cursor:crosshair;touch-action:none;user-select:none;";
        const root = host.attachShadow({ mode: "open" });
        root.innerHTML = `<style>:host{color-scheme:light}.surface{position:absolute;inset:0;background:#1c35552b}.hint{position:absolute;top:16px;left:50%;transform:translateX(-50%);box-sizing:border-box;max-width:calc(100% - 24px);padding:10px 12px;border-radius:10px;background:#fff;color:#293952;box-shadow:0 4px 20px #20334d26;font:13px/1.6 system-ui;cursor:default}.hint button{margin-left:8px;padding:4px 9px;border:1px solid #dbe5f4;border-radius:6px;background:#f4f7fc;color:#346dcd;cursor:pointer}.box{position:absolute;box-sizing:border-box;border:2px solid #3475eb;background:#3475eb18;pointer-events:none}</style><div class="surface"></div><div class="box" hidden></div><div class="hint" role="status">拖动框选需要填写的区域，松开填写；Esc 取消<button type="button">取消</button></div>`;
        const box = root.querySelector<HTMLElement>(".box")!;
        const hint = root.querySelector<HTMLElement>(".hint")!;
        let start: { x: number; y: number; pointer: number } | undefined;
        let finished = false;
        const previousFocus = document.activeElement as HTMLElement | null;
        const finish = (region: FillRegion | null) => {
          if (finished) return;
          finished = true; view.clearTimeout(timer);
          document.removeEventListener("keydown", key, true);
          view.removeEventListener("blur", windowBlur); view.removeEventListener("resize", abort);
          document.removeEventListener("scroll", abort, true);
          host.remove(); cancel = undefined;
          if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
          resolve(region);
        };
        const abort = () => finish(null);
        const windowBlur = (event: Event) => { if (event.target === view) abort(); };
        const key = (event: KeyboardEvent) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); abort(); }
        };
        const rectangle = (x: number, y: number): FillRegion => ({ left: Math.min(start!.x, x), top: Math.min(start!.y, y), right: Math.max(start!.x, x), bottom: Math.max(start!.y, y) });
        root.querySelector("button")!.addEventListener("click", abort);
        host.addEventListener("pointerdown", (event) => {
          if (!event.isTrusted || event.button !== 0 || event.composedPath().includes(hint)) return;
          event.preventDefault(); event.stopImmediatePropagation();
          start = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
          host.setPointerCapture(event.pointerId); box.hidden = false;
        });
        host.addEventListener("pointermove", (event) => {
          if (!start || event.pointerId !== start.pointer) return;
          event.preventDefault(); event.stopImmediatePropagation();
          const r = rectangle(event.clientX, event.clientY);
          Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right-r.left}px`, height: `${r.bottom-r.top}px` });
        });
        host.addEventListener("pointerup", (event) => {
          if (!event.isTrusted || !start || event.pointerId !== start.pointer) return;
          event.preventDefault(); event.stopImmediatePropagation();
          const r = rectangle(event.clientX, event.clientY);
          if (r.right-r.left < 8 || r.bottom-r.top < 8) { start = undefined; box.hidden = true; return; }
          finish(r);
        });
        host.addEventListener("click", (event) => event.stopPropagation());
        host.addEventListener("pointercancel", abort);
        document.addEventListener("keydown", key, true);
        view.addEventListener("blur", windowBlur); view.addEventListener("resize", abort);
        document.addEventListener("scroll", abort, true);
        const timer = view.setTimeout(abort, 120000);
        cancel = abort; document.documentElement.appendChild(host);
        root.querySelector<HTMLButtonElement>("button")!.focus({ preventScroll: true });
      });
    }
  };
}
