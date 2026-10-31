/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountFloatingLauncher, mountFloatingPanel, setFloatingFillState, setFloatingLauncherVisible, unmountFloatingPanel } from "../src/content/floating-launcher";
import { clampFloatingPosition, isFloatingFillState } from "../src/shared/floating-state";

describe("网页悬浮入口", () => {
  beforeEach(() => {
    document.getElementById("offer-star-floating-dock")?.remove();
    unmountFloatingPanel(document);
  });
  it("创建可访问按钮并在点击时触发打开回调", () => {
    const onOpen = vi.fn();
    const launcher = mountFloatingLauncher(document, onOpen, "chrome-extension://test/icons/icon128.png");
    expect(launcher.id).toBe("offer-star-floating-launcher");
    expect(launcher.querySelector("img")?.getAttribute("src")).toBe("chrome-extension://test/icons/icon128.png");
    expect(launcher.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(document.getElementById("offer-star-floating-dock")?.style.right).toBe("0px");
    expect(launcher.getAttribute("aria-label")).toBe("打开极速海投简历助手");
    expect(launcher.getAttribute("aria-haspopup")).toBe("dialog");
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(launcher.getAttribute("aria-controls")).toBe("offer-star-floating-panel");
    launcher.click();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("键盘聚焦时显示可见焦点环，并在离开后清理样式", () => {
    const launcher = mountFloatingLauncher(document, () => undefined, "chrome-extension://test/icons/icon128.png");
    launcher.dispatchEvent(new FocusEvent("focus"));
    expect(launcher.style.outline).toContain("solid");
    launcher.dispatchEvent(new FocusEvent("blur"));
    expect(launcher.style.outline).toBe("none");
  });

  it("重复挂载时复用原按钮，不创建重复入口", () => {
    const first = mountFloatingLauncher(document, () => undefined, "chrome-extension://test/icons/icon128.png");
    const second = mountFloatingLauncher(document, () => undefined, "chrome-extension://test/icons/icon128.png");
    expect(second).toBe(first);
    expect(document.querySelectorAll("#offer-star-floating-launcher")).toHaveLength(1);
  });

  it("在当前网页创建隔离的悬浮面板并支持卸载", () => {
    const first = mountFloatingPanel(document, "chrome-extension://test/floating-panel.html?embedded=1&tabId=7");
    const second = mountFloatingPanel(document, "ignored");
    expect(second).toBe(first);
    expect(first.getAttribute("role")).toBe("dialog");
    expect(first.getAttribute("aria-modal")).toBe("false");
    expect(first.querySelector("iframe")?.getAttribute("src")).toBe("chrome-extension://test/floating-panel.html?embedded=1&tabId=7");
    expect(document.querySelectorAll("#offer-star-floating-panel")).toHaveLength(1);
    unmountFloatingPanel(document);
    expect(document.querySelector("#offer-star-floating-panel")).toBeNull();
  });

  it("面板展开时隐藏悬浮球，卸载后可以恢复显示", () => {
    const launcher = mountFloatingLauncher(document, () => undefined, "chrome-extension://test/icons/icon128.png");
    setFloatingLauncherVisible(document, false);
    expect(document.getElementById("offer-star-floating-dock")?.style.display).toBe("none");
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    setFloatingLauncherVisible(document, true);
    expect(document.getElementById("offer-star-floating-dock")?.style.display).toBe("flex");
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
  });

  it("悬停展开、忙碌时保留进度，网页脚本代点不能开始填写", () => {
    const fill = vi.fn();
    mountFloatingLauncher(document, vi.fn(), "logo.png", fill);
    const dock = document.getElementById("offer-star-floating-dock")!;
    expect(dock.dataset.expanded).toBe("false");
    dock.dispatchEvent(new MouseEvent("mouseenter"));
    expect(dock.dataset.expanded).toBe("true");
    (document.getElementById("offer-star-floating-fill") as HTMLButtonElement).click();
    expect(fill).not.toHaveBeenCalled();
    setFloatingFillState(document, "scanning");
    dock.dispatchEvent(new MouseEvent("mouseleave"));
    expect(dock.dataset.expanded).toBe("true");
    expect(dock.textContent).toContain("正在识别表单");
    setFloatingFillState(document, "success");
    expect(dock.dataset.expanded).toBe("false");
  });

  it("缩小窗口或越界拖动时保留完整控件，拒绝未知状态", () => {
    expect(clampFloatingPosition(-100, 900, 340, 580, 800, 700)).toEqual({ x: 0, y: 120 });
    expect(clampFloatingPosition(900, -100, 288, 380, 320, 420)).toEqual({ x: 32, y: 0 });
    expect(isFloatingFillState("__proto__")).toBe(false);
    expect(isFloatingFillState("success")).toBe(true);
  });
});
