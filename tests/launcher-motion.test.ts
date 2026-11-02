/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountFloatingLauncher, setFloatingFillState, setFloatingLauncherVisible } from "../src/content/floating-launcher";

let launcher: HTMLButtonElement;
let dock: HTMLElement;
let open: ReturnType<typeof vi.fn>;
let send: (type: string, values?: Record<string, unknown>) => void;
let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn> };
let visibility: boolean;
let preferenceChanged: () => void;
let motions: Array<{ target: Element; cancel: ReturnType<typeof vi.fn> }>;
const oldAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");

beforeEach(() => {
  vi.useFakeTimers();
  document.getElementById("offer-star-floating-dock")?.remove();
  visibility = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => visibility);
  media = { matches: false, addEventListener: vi.fn((_type, callback) => { preferenceChanged = callback; }) };
  vi.stubGlobal("matchMedia", () => media);
  motions = [];
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: function (this: Element) {
    const cancel = vi.fn(); motions.push({ target: this, cancel }); return { cancel };
  } });
  const listen = vi.spyOn(EventTarget.prototype, "addEventListener");
  open = vi.fn();
  launcher = mountFloatingLauncher(document, open, "logo.png");
  dock = document.getElementById("offer-star-floating-dock")!;
  Object.assign(launcher, { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true), releasePointerCapture: vi.fn() });
  // 只调用捕获的处理器，不修改真实浏览器事件的 isTrusted，也不依赖测试专用生产接口。
  send = (type, values = {}) => {
    const index = listen.mock.calls.findIndex(([name], i) => name === type && listen.mock.contexts[i] === launcher);
    const callback = listen.mock.calls[index][1] as EventListener;
    callback({ isTrusted: true, button: 0, pointerId: 1, pointerType: "touch", clientX: innerWidth - 20, clientY: innerHeight - 120, ...values } as unknown as Event);
  };
});
afterEach(() => {
  window.dispatchEvent(new Event("blur"));
  document.getElementById("offer-star-floating-dock")?.remove();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (oldAnimate) Object.defineProperty(Element.prototype, "animate", oldAnimate);
  else delete (Element.prototype as unknown as Record<string, unknown>).animate;
});

describe("悬浮入口循环动效与长按拖动", () => {
  it("静置时仅图标播放动效，交互和忙碌时停止", () => {
    expect(motions[0].target).toBe(launcher.querySelector("img"));
    expect(dock.dataset.motion).toBe("running");
    expect(dock.style.flexDirection).toBe("row-reverse");
    dock.dispatchEvent(new MouseEvent("mouseenter"));
    expect(dock.dataset.expanded).toBe("true"); expect(motions[0].cancel).toHaveBeenCalled();
    dock.dispatchEvent(new MouseEvent("mouseleave"));
    expect(dock.dataset.motion).toBe("running");
    setFloatingFillState(document, "scanning"); expect(dock.dataset.motion).toBe("paused");
    setFloatingFillState(document, "idle"); expect(dock.dataset.motion).toBe("running");
  });
  it("后台、隐藏及减少动态效果偏好均暂停，恢复时重新播放", () => {
    visibility = true; document.dispatchEvent(new Event("visibilitychange")); expect(dock.dataset.motion).toBe("paused");
    visibility = false; document.dispatchEvent(new Event("visibilitychange")); expect(dock.dataset.motion).toBe("running");
    setFloatingLauncherVisible(document, false); expect(dock.dataset.motion).toBe("paused");
    setFloatingLauncherVisible(document, true); expect(dock.dataset.motion).toBe("running");
    media.matches = true; preferenceChanged(); expect(dock.dataset.motion).toBe("paused"); expect(dock.style.transition).toBe("none");
    media.matches = false; preferenceChanged(); expect(dock.dataset.motion).toBe("running");
  });
  it("长按三百毫秒进入拖动态，释放不误打开，下一次单击正常", () => {
    send("pointerdown"); vi.advanceTimersByTime(299); expect(dock.dataset.dragging).toBe("pending");
    vi.advanceTimersByTime(1); expect(dock.dataset.dragging).toBe("true"); expect(launcher.style.cursor).toBe("grabbing");
    expect(dock.dataset.expanded).toBe("false"); expect(dock.dataset.motion).toBe("paused");
    send("pointerup"); launcher.click(); expect(open).not.toHaveBeenCalled();
    send("pointerdown"); send("pointerup"); launcher.click(); expect(open).toHaveBeenCalledOnce();
  });
  it("自由拖动后吸附最近边缘，并保留当前页位置", () => {
    const top = Number.parseFloat(dock.style.top);
    send("pointerdown"); vi.advanceTimersByTime(300);
    send("pointermove", { clientX: 30, clientY: innerHeight - 200 });
    expect(dock.style.right).toBe("auto"); expect(Number.parseFloat(dock.style.top)).toBe(top - 80);
    expect(Number.parseFloat(dock.style.left)).toBeGreaterThanOrEqual(0);
    send("pointerup"); expect(dock.dataset.edge).toBe("left"); expect(dock.style.left).toBe("0px");
    expect(dock.style.flexDirection).toBe("row"); launcher.click(); expect(open).not.toHaveBeenCalled();
    const savedTop = dock.style.top; dock.remove();
    mountFloatingLauncher(document, open, "logo.png");
    expect(document.getElementById("offer-star-floating-dock")!.style.top).toBe(savedTop);
    expect(document.getElementById("offer-star-floating-dock")!.dataset.edge).toBe("left");
  });
  it("触屏在长按前明显移动会取消，避免误拖和误打开", () => {
    const top = dock.style.top; send("pointerdown");
    send("pointermove", { clientY: innerHeight - 160 }); vi.advanceTimersByTime(400);
    expect(dock.dataset.dragging).not.toBe("true"); expect(dock.style.top).toBe(top);
    send("pointerup"); launcher.click(); expect(open).not.toHaveBeenCalled();
  });
  it("桌面保留常规按住拖动，非当前指针和网页伪造事件无效", () => {
    send("pointerdown", { isTrusted: false }); expect(dock.dataset.dragging).toBeUndefined();
    send("pointerdown", { pointerType: "mouse" });
    send("pointermove", { pointerId: 2, pointerType: "mouse", clientX: 20 }); expect(dock.dataset.dragging).toBe("pending");
    send("pointermove", { pointerType: "mouse", clientX: innerWidth / 2 }); expect(dock.dataset.dragging).toBe("true");
    send("pointerup"); launcher.click(); expect(open).not.toHaveBeenCalled();
  });
  it("取消、失去指针捕获或窗口焦点均结束拖动", () => {
    for (const type of ["pointercancel", "lostpointercapture", "blur"]) {
      send("pointerdown"); vi.advanceTimersByTime(300);
      if (type === "blur") window.dispatchEvent(new Event("blur")); else send(type);
      expect(dock.dataset.dragging).toBe("false"); expect(launcher.style.cursor).toBe("grab");
      launcher.click(); expect(open).not.toHaveBeenCalled();
    }
  });
  it("拖出视口不会丢失入口，缩小窗口后位置仍有效", () => {
    send("pointerdown"); vi.advanceTimersByTime(300);
    send("pointermove", { clientX: 10000, clientY: 10000 });
    expect(Number.parseFloat(dock.style.top) + 48).toBeLessThanOrEqual(innerHeight);
    expect(Number.parseFloat(dock.style.left) + 48).toBeLessThanOrEqual(innerWidth);
    send("pointerup"); expect(dock.dataset.edge).toBe("right");
    const original = Object.getOwnPropertyDescriptor(window, "innerHeight")!;
    Object.defineProperty(window, "innerHeight", { value: 100, configurable: true });
    try { window.dispatchEvent(new Event("resize")); expect(Number.parseFloat(dock.style.top)).toBeLessThanOrEqual(52); }
    finally { Object.defineProperty(window, "innerHeight", original); }
  });
});
