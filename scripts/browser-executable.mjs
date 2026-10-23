import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { chromium, firefox } from "@playwright/test";

/** 自动化优先使用独立测试浏览器，显式指定路径时不静默回退。 */
export function resolveBrowserExecutable(browser, options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const key = browser === "firefox" ? "FIREFOX_EXECUTABLE_PATH" : "CHROME_EXECUTABLE_PATH";
  if (env[key]) {
    if (!exists(env[key])) throw new Error(`${key} 指定的浏览器不存在，请检查安装路径`);
    return env[key];
  }
  const bundled = options.bundledPath ?? (browser === "firefox" ? firefox : chromium).executablePath();
  const candidates = browser === "firefox" ? {
    darwin: ["/Applications/Firefox.app/Contents/MacOS/firefox", `${homedir()}/Applications/Firefox.app/Contents/MacOS/firefox`],
    win32: ["C:\\Program Files\\Mozilla Firefox\\firefox.exe", "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe"],
    linux: ["/usr/bin/firefox", "/usr/bin/firefox-esr"]
  }[platform] ?? [] : [];
  const executable = [...candidates, bundled].find((path) => exists(path));
  if (!executable) {
    throw new Error(`未找到${browser === "firefox" ? " Firefox" : " Chromium"} 测试浏览器，请运行 npx playwright install ${browser} 或配置 ${key}`);
  }
  return executable;
}
