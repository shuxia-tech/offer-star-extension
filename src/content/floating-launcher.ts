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
    width: "48px", maxWidth: "100vw", padding: "5px", gap: "8px", overflow: "hidden", border: "1px solid #e8ebf0",
    borderRadius: "26px 0 0 26px", background: "#fff", boxShadow: "0 4px 20px #23334d1c",
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif', color: "#354258",
    transition: motionPreference?.matches ? "none" : "width .18s ease"
  });
  const launcher = document.createElement("button");
  launcher.id = "offer-star-floating-launcher"; launcher.type = "button";
  launcher.title = "单击打开极速海投；长按约 0.3 秒拖动，松手自动贴边；方向键移动";
  launcher.setAttribute("aria-label", "打开极速海投简历助手"); launcher.setAttribute("aria-haspopup", "dialog");
  launcher.setAttribute("aria-expanded", "false"); launcher.setAttribute("aria-controls", "offer-star-floating-panel");
  Object.assign(launcher.style, { all: "initial", display: "grid", placeItems: "center", boxSizing: "border-box", width: "36px", height: "36px", flex: "0 0 36px", padding: "4px", border: "0", borderRadius: "50%", cursor: "grab", touchAction: "none", outlineOffset: "1px" });
  const logo = document.createElement("img");
  logo.src = logoUrl; logo.alt = ""; logo.draggable = false;
  Object.assign(logo.style, { all: "initial", display: "block", width: "28px", height: "28px", borderRadius: "8px", pointerEvents: "none" });
  launcher.appendChild(logo);
  const label = document.createElement("span"); label.id = "offer-star-floating-status";
  label.setAttribute("role", "status"); label.setAttribute("aria-live", "polite");
  Object.assign(label.style, { fontSize: "13px", fontWeight: "600", lineHeight: "1.4", flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
  const action = document.createElement("button"); action.type = "button"; action.id = "offer-star-floating-fill";
  const manage = document.createElement("button"); manage.type = "button"; manage.textContent = "完善简历"; manage.id = "offer-star-floating-manage";
  for (const button of [action, manage]) Object.assign(button.style, {
    all: "initial", boxSizing: "border-box", flex: "0 0 auto", minHeight: "34px", padding: "0 12px", fontFamily: "inherit", fontSize: "12px", fontWeight: "650", lineHeight: "34px", textAlign: "center", borderRadius: "11px", background: "linear-gradient(120deg, #ff7546, #ff4c1c)", color: "#fff", cursor: "pointer", outlineOffset: "2px"
  });
  Object.assign(manage.style, { background: "#fff1e9", color: "#ed5c24", padding: "0 10px" });
  dock.append(launcher, label, manage, action);
  let state: FloatingFillState = "idle", hovered = false, focused = false, suppressClick = false;
  let drag: { pointer: number; start: Point; origin: Point; moved: boolean; armed: boolean; cancelled: boolean } | undefined;
  let holdTimer: number | undefined;
  let idleAnimation: Animation | undefined;
  const syncIdleMotion = () => {
    const playing = !motionPreference?.matches && !document.hidden && dock.isConnected && dock.style.display !== "none" && !drag && !hovered && !focused && !isFloatingFillBusy(state);
    if (!playing) { idleAnimation?.cancel(); idleAnimation = undefined; }
    else if (!idleAnimation && logo.animate) {
      // 动效只作用于图标，不移动点击区域；三秒一轮，交互和后台状态均暂停。
      idleAnimation = logo.animate([
        { transform: "translateY(0) scale(1)", filter: "drop-shadow(0 0 0 rgba(255,108,61,0))" },
        { transform: "translateY(-2px) scale(1.04)", filter: "drop-shadow(0 2px 4px rgba(255,108,61,.24))" },
        { transform: "translateY(0) scale(1)", filter: "drop-shadow(0 0 0 rgba(255,108,61,0))" }
      ], { duration: 3000, iterations: Infinity, easing: "ease-in-out" });
    }
    dock.dataset.motion = idleAnimation ? "running" : "paused";
  };
  dockMotionUpdates.set(document, syncIdleMotion);
  const saved = placement(document).dock;
  let edge = saved?.edge ?? "right";
  const positionDock = (top: number) => {
    dock.style.top = `${Math.min(Math.max(0, top), Math.max(0, viewport(document).height - 48))}px`;
    dock.style.left = edge === "left" ? "0px" : "auto"; dock.style.right = edge === "right" ? "0px" : "auto";
    dock.style.borderRadius = edge === "right" ? "26px 0 0 26px" : "0 26px 26px 0";
    // 图标始终靠屏幕边缘，展开快捷条时不会从指针下方移开。
    dock.style.flexDirection = edge === "right" ? "row-reverse" : "row";
    dock.dataset.edge = edge;
  };
  const render = () => {
    const expanded = !drag && (hovered || focused || isFloatingFillBusy(state));
    dock.dataset.expanded = String(expanded); dock.dataset.state = state;
    dock.style.width = expanded ? "min(350px, 100vw)" : "48px";
    for (const element of [label, action]) element.style.display = expanded ? "block" : "none";
    manage.style.display = expanded && state === "missing" ? "block" : "none";
    label.textContent = floatingFillLabels[state]; label.title = floatingFillLabels[state];
    action.textContent = isFloatingFillBusy(state) ? "查看" : state === "login" ? "登录" : state === "idle" ? "填写" : "重新填写";
    action.setAttribute("aria-label", isFloatingFillBusy(state) ? "查看填写进度" : state === "login" ? "登录后填写" : state === "idle" ? "快捷填写" : "重新填写");
    dock.setAttribute("aria-busy", String(isFloatingFillBusy(state)));
    dock.style.transition = motionPreference?.matches || drag ? "none" : "width .18s ease";
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
    if (!drag || drag.cancelled) return;
    drag.armed = true;
    suppressClick = true;
    dock.dataset.dragging = "true";
    launcher.style.cursor = "grabbing";
    launcher.style.boxShadow = "0 0 0 2px #ffbc9a";
    render();
  };
  launcher.addEventListener("pointerdown", (event) => {
    if (!event.isTrusted || event.button !== 0 || drag) return;
    // 按下时收起快捷条，以固定的 48px 命中区域拖动；桌面也保留常规按住拖动。
    const bounds = viewport(document);
    drag = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: edge === "left" ? 0 : Math.max(0, bounds.width - 48), y: Number.parseFloat(dock.style.top) || 0 }, moved: false, armed: false, cancelled: false };
    suppressClick = false;
    dock.dataset.dragging = "pending";
    launcher.setPointerCapture?.(event.pointerId);
    holdTimer = view.setTimeout(armDrag, 300);
    render();
  });
  launcher.addEventListener("pointermove", (event) => {
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
  });
  const finishDrag = (pointer?: number, cancelled = false) => {
    if (!drag || pointer !== undefined && pointer !== drag.pointer) return;
    const current = drag;
    drag = undefined;
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
  view.addEventListener("resize", () => positionDock(Number.parseFloat(dock.style.top)));
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
