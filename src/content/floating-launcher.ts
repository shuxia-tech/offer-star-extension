import { clampFloatingPosition, floatingFillLabels, isFloatingFillBusy, type FloatingFillState } from "../shared/floating-state";

type Point = { x: number; y: number };
type Placement = { panel?: Point; dock?: { top: number; edge: "left" | "right" }; cleanupPanel?: () => void };
const placements = new WeakMap<Document, Placement>();
const dockRenderers = new WeakMap<Document, (state: FloatingFillState) => void>();
const dockMotionUpdates = new WeakMap<Document, () => void>();
const panelDrags = new WeakMap<Document, { start: Point; origin: Point; cleanup: () => void }>();
function placement(document: Document) {
  let value = placements.get(document);
  if (!value) { value = {}; placements.set(document, value); }
  return value;
}
function viewport(document: Document) {
  return { width: document.defaultView?.innerWidth ?? 1024, height: document.defaultView?.innerHeight ?? 768 };
}

/** 右侧贴边的快捷填写条；填写动作只能由真实用户点击发起。 */
export function mountFloatingLauncher(document: Document, onOpen: () => void, logoUrl: string, onFill: () => void = onOpen, onManage: () => void = onOpen) {
  const existing = document.getElementById("offer-star-floating-launcher");
  if (existing) return existing as HTMLButtonElement;
  const view = document.defaultView!;
  const motionPreference = view.matchMedia?.("(prefers-reduced-motion: reduce)");
  const dock = document.createElement("div");
  dock.id = "offer-star-floating-dock";
  dock.setAttribute("role", "group"); dock.setAttribute("aria-label", "极速海投快捷填写");
  Object.assign(dock.style, {
    all: "initial", position: "fixed", right: "0", top: `${Math.max(0, view.innerHeight - 140)}px`,
    zIndex: "2147483647", display: "flex", alignItems: "center", boxSizing: "border-box", height: "48px",
    width: "48px", maxWidth: "100vw", padding: "5px", gap: "10px", overflow: "hidden", border: "1px solid #e8ebf0",
    borderRadius: "26px 0 0 26px", background: "#fff", boxShadow: "0 4px 20px #23334d1c",
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif', color: "#354258",
    transition: "none"
  });
  const launcher = document.createElement("button");
  launcher.id = "offer-star-floating-launcher"; launcher.type = "button";
  launcher.title = "单击打开极速海投；长按约 0.3 秒拖动，松手自动贴边；方向键移动";
  launcher.setAttribute("aria-label", "打开极速海投简历助手"); launcher.setAttribute("aria-haspopup", "dialog");
  launcher.setAttribute("aria-expanded", "false"); launcher.setAttribute("aria-controls", "offer-star-floating-panel");
  Object.assign(launcher.style, { all: "initial", position: "relative", display: "grid", placeItems: "center", boxSizing: "border-box", width: "36px", height: "36px", flex: "0 0 36px", padding: "4px", border: "0", borderRadius: "50%", cursor: "grab", touchAction: "none", outlineOffset: "1px" });
  const logo = document.createElement("img");
  logo.src = logoUrl; logo.alt = ""; logo.draggable = false;
  Object.assign(logo.style, { all: "initial", display: "block", width: "28px", height: "28px", opacity: "0", pointerEvents: "none" });
  launcher.appendChild(logo);
  // 橙色底板保持不动，白色纸飞机单独飞出和返回，避免整个 Logo 方块移动。
  const plate = document.createElement("span");
  Object.assign(plate.style, { position: "absolute", left: "4px", top: "4px", width: "28px", height: "28px", borderRadius: "7px", background: "linear-gradient(135deg, #ff942c, #ff352d)", pointerEvents: "none" });
  const plane = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  plane.id = "offer-star-floating-plane";
  plane.setAttribute("viewBox", "0 0 128 128"); plane.setAttribute("aria-hidden", "true"); plane.setAttribute("focusable", "false");
  Object.assign(plane.style, { position: "absolute", left: "4px", top: "4px", width: "28px", height: "28px", color: "#fff", overflow: "visible", pointerEvents: "none", transformOrigin: "50% 50%", filter: "drop-shadow(0 1px 2px #8e4b3038)" });
  const planePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  planePath.setAttribute("fill", "currentColor"); planePath.setAttribute("fill-rule", "evenodd");
  planePath.setAttribute("d", "M104 27 79 100 60 79 43 89 49 68 28 55Z M49 68 86 42 60 63 74 63 60 79Z");
  plane.appendChild(planePath); launcher.append(plate, plane);
  const label = document.createElement("span"); label.id = "offer-star-floating-status";
  label.setAttribute("role", "status"); label.setAttribute("aria-live", "polite");
  Object.assign(label.style, { fontSize: "13px", fontWeight: "500", color: "#68758a", lineHeight: "1.4", flex: "0 1 auto", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
  const action = document.createElement("button"); action.type = "button"; action.id = "offer-star-floating-fill";
  const manage = document.createElement("button"); manage.type = "button"; manage.textContent = "完善简历"; manage.id = "offer-star-floating-manage";
  for (const button of [action, manage]) Object.assign(button.style, {
    all: "initial", boxSizing: "border-box", flex: "0 0 auto", minHeight: "34px", padding: "0 12px", fontFamily: "inherit", fontSize: "12px", fontWeight: "650", lineHeight: "34px", textAlign: "center", borderRadius: "11px", background: "linear-gradient(120deg, #ff7546, #ff4c1c)", color: "#fff", cursor: "pointer", outlineOffset: "2px"
  });
  Object.assign(manage.style, { background: "#fff1e9", color: "#ed5c24", padding: "0 10px" });
  const content = document.createElement("div");
  content.id = "offer-star-floating-content";
  Object.assign(content.style, { all: "initial", display: "flex", alignItems: "center", gap: "10px", flex: "0 0 auto", width: "max-content", minWidth: "0", fontFamily: "inherit", visibility: "hidden", opacity: "0", pointerEvents: "none" });
  content.append(label, manage, action);
  dock.append(launcher, content);
  let state: FloatingFillState = "idle", hovered = false, focused = false, suppressClick = false;
  let drag: { pointer: number; start: Point; origin: Point; moved: boolean; armed: boolean; cancelled: boolean } | undefined;
  let holdTimer: number | undefined;
  let dragShield: HTMLDivElement | undefined;
  let idleAnimation: Animation | undefined;
  let widthTransitioning = false;
  let targetWidth = 48;
  let settleTimer: number | undefined;
  const saved = placement(document).dock;
  let edge = saved?.edge ?? "right";
  const syncIdleMotion = () => {
    const playing = !motionPreference?.matches && !document.hidden && dock.isConnected && dock.style.display !== "none" && !widthTransitioning && !drag && !hovered && !focused && !isFloatingFillBusy(state);
    if (!playing) { idleAnimation?.cancel(); idleAnimation = undefined; }
    else if (!idleAnimation && plane.animate) {
      const direction = edge === "right" ? -1 : 1;
      const outbound = edge === "right" ? -90 : 0, inbound = edge === "right" ? 90 : 180;
      idleAnimation = plane.animate([
        { offset: 0, transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1, color: "#fff" },
        { offset: .35, transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1, color: "#fff" },
        { offset: .44, transform: `translate(${direction * 4}px, -3px) rotate(${outbound * .85}deg) scale(1.02)`, opacity: 1, color: "#fff" },
        { offset: .57, transform: `translate(${direction * 38}px, -30px) rotate(${outbound}deg) scale(.75)`, opacity: 0, color: "#ff6a35" },
        { offset: .64, transform: `translate(${direction * 38}px, -30px) rotate(${inbound}deg) scale(.75)`, opacity: 0, color: "#ff6a35" },
        { offset: .76, transform: `translate(${direction * 20}px, -16px) rotate(${inbound}deg) scale(.88)`, opacity: 1, color: "#ff6a35" },
        { offset: .9, transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1, color: "#fff" },
        { offset: 1, transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1, color: "#fff" }
      ], { duration: 4600, iterations: Infinity, easing: "ease-in-out" });
    }
    dock.dataset.motion = idleAnimation ? "running" : "paused";
  };
  dockMotionUpdates.set(document, syncIdleMotion);
  const settleWidth = () => {
    widthTransitioning = false;
    dock.style.overflow = dock.dataset.expanded === "true" ? "hidden" : "visible";
    syncIdleMotion();
  };
  const updateDockWidth = () => {
    const expanded = dock.dataset.expanded === "true";
    content.style.maxWidth = `${Math.max(0, viewport(document).width - 72)}px`;
    const next = Math.min(viewport(document).width, expanded ? 72 + content.getBoundingClientRect().width : 48);
    const immediate = motionPreference?.matches || drag?.armed || !dock.isConnected;
    dock.style.transition = immediate ? "none" : "width 320ms cubic-bezier(.22, 1, .36, 1), padding 320ms cubic-bezier(.22, 1, .36, 1)";
    if (next !== targetWidth || immediate) {
      view.clearTimeout(settleTimer);
      widthTransitioning = !immediate && next !== targetWidth;
      targetWidth = next;
      dock.style.overflow = "hidden";
      dock.style.width = `${next}px`;
      if (widthTransitioning) settleTimer = view.setTimeout(settleWidth, 350);
      else settleWidth();
    } else if (!widthTransitioning) settleWidth();
  };
  dock.addEventListener("transitionend", (event) => {
    if (event.target === dock && event.propertyName === "width") { view.clearTimeout(settleTimer); settleWidth(); }
  });
  const positionDock = (top: number) => {
    dock.style.top = `${Math.min(Math.max(0, top), Math.max(0, viewport(document).height - 48))}px`;
    dock.style.left = edge === "left" ? "0px" : "auto"; dock.style.right = edge === "right" ? "0px" : "auto";
    dock.style.borderRadius = edge === "right" ? "26px 0 0 26px" : "0 26px 26px 0";
    // 两侧吸附都保持 Logo、说明、操作按钮的阅读顺序。
    dock.style.flexDirection = "row";
    dock.dataset.edge = edge;
  };
  const render = () => {
    const expanded = !drag?.armed && (hovered || focused || isFloatingFillBusy(state));
    dock.dataset.expanded = String(expanded); dock.dataset.state = state;
    manage.style.display = state === "missing" ? "block" : "none";
    label.textContent = floatingFillLabels[state]; label.title = floatingFillLabels[state];
    action.textContent = isFloatingFillBusy(state) ? "查看" : state === "login" ? "登录" : state === "idle" ? "填写" : "重新填写";
    action.setAttribute("aria-label", isFloatingFillBusy(state) ? "查看填写进度" : state === "login" ? "登录后填写" : state === "idle" ? "快捷填写" : "重新填写");
    dock.setAttribute("aria-busy", String(isFloatingFillBusy(state)));
    updateDockWidth();
    dock.style.padding = expanded ? "5px 12px" : "5px";
    content.inert = !expanded;
    content.setAttribute("aria-hidden", String(!expanded));
    content.style.transition = motionPreference?.matches || drag?.armed ? "none" : expanded ? "opacity 180ms ease 70ms, transform 280ms cubic-bezier(.22, 1, .36, 1) 40ms, visibility 0s" : "opacity 120ms ease, transform 160ms ease, visibility 0s linear 160ms";
    content.style.visibility = expanded ? "visible" : "hidden";
    content.style.opacity = expanded ? "1" : "0";
    content.style.transform = expanded ? "translateX(0)" : "translateX(8px)";
    content.style.pointerEvents = expanded ? "auto" : "none";
    syncIdleMotion();
  };
  dockRenderers.set(document, (value) => { state = value; render(); });
  dock.addEventListener("mouseenter", () => { hovered = true; render(); });
  dock.addEventListener("mouseleave", () => { hovered = false; render(); });
  dock.addEventListener("focusin", () => { focused = true; render(); });
  dock.addEventListener("focusout", (event) => { focused = dock.contains(event.relatedTarget as Node | null); render(); });
  for (const button of [launcher, action, manage]) {
    button.addEventListener("focus", () => { button.style.outline = "2px solid #ff9165"; });
    button.addEventListener("blur", () => { button.style.outline = "none"; });
  }
  launcher.addEventListener("click", (event) => {
    if (suppressClick) { suppressClick = false; event.preventDefault(); return; }
    onOpen();
  });
  action.addEventListener("click", (event) => { if (event.isTrusted) { if (isFloatingFillBusy(state)) onOpen(); else onFill(); } });
  manage.addEventListener("click", (event) => { if (event.isTrusted) onManage(); });
  const clearHold = () => { view.clearTimeout(holdTimer); holdTimer = undefined; };
  const armDrag = () => {
    if (!drag || drag.cancelled || drag.armed) return;
    drag.armed = true;
    suppressClick = true;
    dock.dataset.dragging = "true";
    launcher.style.cursor = "grabbing";
    launcher.style.boxShadow = "0 0 0 2px #ffbc9a";
    const bounds = viewport(document);
    const start = clampFloatingPosition(drag.origin.x, drag.origin.y, 48, 48, bounds.width, bounds.height);
    Object.assign(dock.style, { left: `${start.x}px`, right: "auto", top: `${start.y}px`, borderRadius: "24px" });
    // 拖动跨过网页 iframe 时，用透明层保持指针连贯，避免焦点切换中断拖动。
    dragShield = document.createElement("div");
    dragShield.id = "offer-star-launcher-drag-shield";
    Object.assign(dragShield.style, { position: "fixed", inset: "0", zIndex: "2147483647", cursor: "grabbing", touchAction: "none", userSelect: "none", background: "transparent" });
    dragShield.addEventListener("pointermove", onPointerMove);
    dragShield.addEventListener("pointerup", (event) => finishDrag(event.pointerId));
    dragShield.addEventListener("pointercancel", (event) => finishDrag(event.pointerId, true));
    document.documentElement.insertBefore(dragShield, dock);
    render();
  };
  launcher.addEventListener("pointerdown", (event) => {
    if (!event.isTrusted || event.button !== 0 || drag) return;
    // 普通点击保持展开布局；真正开始拖动时以 Logo 的原位置收起，避免跳到右侧。
    const bounds = viewport(document);
    const iconRect = launcher.getBoundingClientRect();
    drag = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: iconRect.width ? iconRect.left - 6 : edge === "left" ? 0 : Math.max(0, bounds.width - 48), y: Number.parseFloat(dock.style.top) || 0 }, moved: false, armed: false, cancelled: false };
    suppressClick = false;
    dock.dataset.dragging = "pending";
    launcher.setPointerCapture?.(event.pointerId);
    holdTimer = view.setTimeout(armDrag, 300);
    render();
  });
  const onPointerMove = (event: PointerEvent) => {
    if (!event.isTrusted || !drag || event.pointerId !== drag.pointer || drag.cancelled) return;
    const dx = event.clientX - drag.start.x, dy = event.clientY - drag.start.y;
    if (!drag.armed) {
      if (event.pointerType !== "touch" && Math.hypot(dx, dy) >= 6) armDrag();
      else if (Math.hypot(dx, dy) >= 10) { drag.cancelled = true; suppressClick = true; clearHold(); return; }
      else return;
    }
    if (Math.hypot(dx, dy) < 3 && !drag.moved) return;
    clearHold();
    drag.moved = true;
    const bounds = viewport(document);
    const next = clampFloatingPosition(drag.origin.x + dx, drag.origin.y + dy, 48, 48, bounds.width, bounds.height);
    Object.assign(dock.style, { left: `${next.x}px`, right: "auto", top: `${next.y}px`, borderRadius: "24px" });
  };
  launcher.addEventListener("pointermove", onPointerMove);
  const finishDrag = (pointer?: number, cancelled = false) => {
    if (!drag || pointer !== undefined && pointer !== drag.pointer) return;
    const current = drag;
    drag = undefined;
    dragShield?.remove(); dragShield = undefined;
    clearHold();
    suppressClick = cancelled || current.armed || current.moved || current.cancelled;
    if (current.moved) {
      const bounds = viewport(document);
      const left = Number.parseFloat(dock.style.left) || 0;
      edge = left + 24 < bounds.width / 2 ? "left" : "right";
    }
    positionDock(Number.parseFloat(dock.style.top));
    placement(document).dock = { top: Number.parseFloat(dock.style.top), edge };
    dock.dataset.dragging = "false";
    launcher.style.cursor = "grab";
    launcher.style.boxShadow = "none";
    if (current.armed || current.cancelled || cancelled) { hovered = false; focused = false; launcher.blur(); }
    if (launcher.hasPointerCapture?.(current.pointer)) launcher.releasePointerCapture(current.pointer);
    render();
  };
  launcher.addEventListener("pointerup", (event) => finishDrag(event.pointerId));
  launcher.addEventListener("pointercancel", (event) => finishDrag(event.pointerId, true));
  launcher.addEventListener("lostpointercapture", (event) => finishDrag(event.pointerId, true));
  launcher.addEventListener("contextmenu", (event) => { if (drag?.armed || suppressClick) event.preventDefault(); });
  view.addEventListener("blur", () => finishDrag(undefined, true));
  document.addEventListener("visibilitychange", () => { if (document.hidden) finishDrag(undefined, true); syncIdleMotion(); });
  motionPreference?.addEventListener?.("change", render);
  launcher.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") suppressClick = false;
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") edge = "left";
    if (event.key === "ArrowRight") edge = "right";
    positionDock(Number.parseFloat(dock.style.top) + (event.key === "ArrowUp" ? -10 : event.key === "ArrowDown" ? 10 : 0));
    placement(document).dock = { top: Number.parseFloat(dock.style.top), edge };
  });
  view.addEventListener("resize", () => { positionDock(Number.parseFloat(dock.style.top)); render(); });
  if (view.ResizeObserver) new view.ResizeObserver(updateDockWidth).observe(content);
  positionDock(saved?.top ?? view.innerHeight - 140);
  document.documentElement.appendChild(dock);
  render();
  return launcher;
}

export function setFloatingFillState(document: Document, state: FloatingFillState) { dockRenderers.get(document)?.(state); }
export function setFloatingLauncherVisible(document: Document, visible: boolean) {
  const dock = document.getElementById("offer-star-floating-dock");
  if (dock) dock.style.display = visible ? "flex" : "none";
  dockMotionUpdates.get(document)?.();
  document.getElementById("offer-star-floating-launcher")?.setAttribute("aria-expanded", String(!visible));
}
function placePanel(document: Document, point: Point) {
  const panel = document.getElementById("offer-star-floating-panel");
  if (!panel) return;
  const rect = panel.getBoundingClientRect(), bounds = viewport(document);
  const next = clampFloatingPosition(point.x, point.y, rect.width, rect.height, bounds.width, bounds.height);
  Object.assign(panel.style, { left: `${next.x}px`, top: `${next.y}px`, right: "auto", bottom: "auto" });
  placement(document).panel = next;
}
/** 使用屏幕坐标，避免 iframe 移动时坐标跳动；调用方须验证消息来源。 */
export function dragFloatingPanel(document: Document, stage: "start" | "move" | "end", x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const panel = document.getElementById("offer-star-floating-panel");
  if (!panel) return;
  if (stage === "start") {
    panelDrags.get(document)?.cleanup();
    const rect = panel.getBoundingClientRect();
    // 跨 iframe 边界时浏览器不会持续向内层派发指针事件，用宿主透明层接住后续拖动。
    const shield = document.createElement("div");
    shield.id = "offer-star-panel-drag-shield";
    Object.assign(shield.style, { position: "fixed", inset: "0", zIndex: "2147483647", cursor: "grabbing", touchAction: "none", userSelect: "none", background: "transparent" });
    const cleanup = () => { shield.remove(); document.defaultView?.removeEventListener("blur", end); panelDrags.delete(document); };
    const end = () => cleanup();
    shield.addEventListener("pointermove", (event) => dragFloatingPanel(document, "move", event.screenX, event.screenY));
    shield.addEventListener("pointerup", end);
    shield.addEventListener("pointercancel", end);
    document.defaultView?.addEventListener("blur", end);
    panelDrags.set(document, { start: { x, y }, origin: { x: rect.left, y: rect.top }, cleanup });
    document.documentElement.appendChild(shield);
  } else if (stage === "end") panelDrags.get(document)?.cleanup();
  else { const drag = panelDrags.get(document); if (drag) placePanel(document, { x: drag.origin.x + x - drag.start.x, y: drag.origin.y + y - drag.start.y }); }
}
export function nudgeFloatingPanel(document: Document, dx: number, dy: number) {
  if (![dx, dy].every(Number.isFinite) || Math.abs(dx) > 40 || Math.abs(dy) > 40) return;
  const rect = document.getElementById("offer-star-floating-panel")?.getBoundingClientRect();
  if (rect) placePanel(document, { x: rect.left + dx, y: rect.top + dy });
}
/** 快捷填写使用隐藏 iframe，复用既有登录、扫描、填写流程。 */
export function setFloatingPanelVisible(document: Document, visible: boolean) {
  const panel = document.getElementById("offer-star-floating-panel");
  if (!panel) return;
  panel.style.visibility = visible ? "visible" : "hidden"; panel.style.pointerEvents = visible ? "auto" : "none";
  panel.setAttribute("aria-hidden", String(!visible));
}
export function mountFloatingPanel(document: Document, panelUrl: string) {
  const existing = document.getElementById("offer-star-floating-panel");
  if (existing) return existing as HTMLDivElement;
  const panel = document.createElement("div");
  panel.id = "offer-star-floating-panel"; panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "极速海投简历助手"); panel.setAttribute("aria-modal", "false");
  Object.assign(panel.style, { position: "fixed", right: "16px", bottom: "20px", zIndex: "2147483646", width: "min(340px, calc(100vw - 32px))", height: "min(580px, calc(100vh - 40px))", minHeight: "min(360px, calc(100vh - 40px))", background: "#fff", border: "1px solid #d9e2f2", borderRadius: "14px", overflow: "hidden", boxShadow: "0 12px 40px rgba(15, 35, 75, .24)" });
  const frame = document.createElement("iframe");
  frame.id = "offer-star-floating-panel-frame"; frame.title = "极速海投简历助手悬浮面板"; frame.src = panelUrl;
  frame.setAttribute("allow", "clipboard-read; clipboard-write");
  Object.assign(frame.style, { display: "block", width: "100%", height: "100%", border: "0" }); panel.appendChild(frame);
  document.documentElement.appendChild(panel);
  const saved = placement(document).panel; if (saved) placePanel(document, saved);
  const onResize = () => { const current = placement(document).panel; if (current) placePanel(document, current); };
  document.defaultView?.addEventListener("resize", onResize);
  placement(document).cleanupPanel = () => document.defaultView?.removeEventListener("resize", onResize);
  return panel;
}
export function unmountFloatingPanel(document: Document) {
  placement(document).cleanupPanel?.(); panelDrags.get(document)?.cleanup(); document.getElementById("offer-star-floating-panel")?.remove();
}
