import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/panel/styles.css", import.meta.url), "utf8");

describe("悬浮面板视觉契约", () => {
  it("下拉控件使用统一箭头和非原生外观，同时保留键盘焦点样式", () => {
    expect(styles).toContain("appearance: none");
    expect(styles).toContain("background-image: url(\"data:image/svg+xml");
    expect(styles).toContain("select:focus-visible");
  });

  it("面板在减少动态效果时关闭动画", () => {
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("transition-duration: .01ms");
  });

  it("登录状态检查期间显示骨架加载样式", () => {
    expect(styles).toContain('.resume-card[aria-busy="true"]');
    expect(styles).toContain(".resume-loading");
    expect(styles).toContain(".loading-bar");
  });

  it("AI 分析期间显示按钮动效", () => {
    expect(styles).toContain(".ai-button-pending");
    expect(styles).toContain("offer-star-spin");
  });

  it("安全验证状态使用独立的警示色", () => {
    expect(styles).toContain(".status-security");
    expect(styles).toContain("background: #fff8e8");
  });

  it("页面上下文卡片会区分待填写、已填写和需验证状态", () => {
    expect(styles).toContain(".page-context-badge-done");
    expect(styles).toContain(".page-context-badge-security");
  });

  it("空扫描结果提供清晰的重试入口", () => {
    expect(styles).toContain(".empty-scan-card");
    expect(styles).toContain(".empty-scan-copy");
  });

  it("窄屏面板禁止横向滚动并让主要操作改为单列", () => {
    expect(styles).toContain("overflow-x: hidden");
    expect(styles).toContain(".primary-actions { flex-direction: column; }");
  });
});
