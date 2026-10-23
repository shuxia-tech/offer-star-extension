import { describe, expect, it } from "vitest";
import { resolveBrowserExecutable } from "../scripts/browser-executable.mjs";
import { productionBuildEnv } from "../scripts/run-cli.mjs";
import { readFirefoxDebugPort } from "../scripts/firefox-debug-port.mjs";

describe("跨平台浏览器验收配置", () => {
  it.each([
    ["darwin", "/Applications/Firefox.app/Contents/MacOS/firefox"],
    ["win32", "C:\\Program Files\\Mozilla Firefox\\firefox.exe"],
    ["linux", "/usr/bin/firefox"]
  ])("识别 %s 上的 Firefox 安装路径", (platform, expected) => {
    expect(resolveBrowserExecutable("firefox", { platform, env: {}, exists: (path) => path === expected, bundledPath: "/test/firefox" })).toBe(expected);
  });

  it("Chromium 使用独立的 Playwright 浏览器", () => {
    expect(resolveBrowserExecutable("chromium", { platform: "darwin", env: {}, exists: () => true, bundledPath: "/test/chromium" })).toBe("/test/chromium");
  });

  it("显式路径支持空格且无效时不静默回退", () => {
    const env = { CHROME_EXECUTABLE_PATH: "/test path/chromium" };
    expect(resolveBrowserExecutable("chromium", { env, exists: () => true })).toBe(env.CHROME_EXECUTABLE_PATH);
    expect(() => resolveBrowserExecutable("chromium", { env, exists: () => false })).toThrow("CHROME_EXECUTABLE_PATH");
  });

  it("Firefox 未安装时可使用 Playwright 版本，完全缺失时提供安装命令", () => {
    expect(resolveBrowserExecutable("firefox", { env: {}, exists: (path) => path === "/test/firefox", bundledPath: "/test/firefox" })).toBe("/test/firefox");
    expect(() => resolveBrowserExecutable("firefox", { env: {}, exists: () => false })).toThrow("npx playwright install firefox");
  });

  it("恢复生产构建时移除测试 AI 配置且不修改调用方环境", () => {
    const env = { OFFER_STAR_E2E_AI: "1", VITE_OFFER_STAR_AI_URL: "http://127.0.0.1:4173/api/mock-ai", PATH: "/test" };
    expect(productionBuildEnv(env)).toEqual({ PATH: "/test" });
    expect(env.OFFER_STAR_E2E_AI).toBe("1");
  });

  it("读取临时实例的真实调试端口，不把其他日志中的数字当作端口", () => {
    expect(readFirefoxDebugPort("Firefox args: -start-debugger-server 50097 -profile /test profile")).toBe(50097);
    expect(readFirefoxDebugPort("Firefox args: -foreground -start-debugger-server 9876 -no-remote")).toBe(9876);
    expect(readFirefoxDebugPort("Vite: http://127.0.0.1:4173/")).toBeNull();
    expect(readFirefoxDebugPort("Firefox args: -start-debugger-server 99999")).toBeNull();
  });
});
