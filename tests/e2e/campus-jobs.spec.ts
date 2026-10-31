import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "../../scripts/browser-executable.mjs";
import { readFileSync } from "node:fs";

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.output/chrome-mv3");
const version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

for (const width of [1280, 320]) {
  test(`底栏在 ${width}px 窗口展示版本、帮助并安全打开校招信息`, async () => {
    const context = await chromium.launchPersistentContext("", {
      headless: true,
      executablePath: resolveBrowserExecutable("chromium"),
      viewport: { width, height: 900 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    try {
      // 拦截官网导航，只验证跳转目标，不请求真实账号或业务服务。
      await context.route("https://offer.gfjianli.com/", (route) => route.fulfill({ contentType: "text/html", body: "<title>校招信息测试页</title>" }));
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/simple.html");
      await expect.poll(() => page.locator("#offer-star-floating-launcher img").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(128);
      await page.getByRole("button", { name: "打开极速海投简历助手" }).click();
      const panel = page.frameLocator("#offer-star-floating-panel iframe");
      await expect(panel.getByRole("heading", { name: "极速海投", exact: true })).toBeVisible();
      await expect.poll(() => panel.locator(".brand-mark img").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(128);
      const link = panel.getByRole("link", { name: "校招信息汇总" });
      const official = panel.getByRole("link", { name: "访问官网", exact: true });
      await expect(official).toHaveAttribute("href", "https://offer.gfjianli.com/");
      await expect(panel.locator(".footer-links a")).toHaveText(["访问官网", "校招信息汇总"]);
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", "https://offer.gfjianli.com/");
      await expect(panel.locator(".footer-version")).toHaveText(`v${version}版本`);
      await expect(panel.locator(".panel-footer")).toBeInViewport({ ratio: 1 });
      await expect.poll(() => panel.locator("main").evaluate((element) => {
        const footer = element.querySelector("footer")!.getBoundingClientRect();
        const main = element.getBoundingClientRect();
        return element.scrollWidth <= element.clientWidth && footer.bottom <= main.bottom && main.bottom - footer.bottom <= 16;
      })).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`campus-jobs-${width}.png`) });
      const help = panel.getByRole("button", { name: "帮助", exact: true });
      await help.click();
      await expect(help).toHaveAttribute("aria-expanded", "true");
      await expect(panel.getByRole("region", { name: "使用帮助" })).toContainText("手动提交申请");
      await page.screenshot({ path: test.info().outputPath(`footer-help-${width}.png`) });
      await help.press("Escape");
      await expect(panel.getByRole("region", { name: "使用帮助" })).toHaveCount(0);
      await expect(help).toHaveAttribute("aria-expanded", "false");
      await help.click();
      await panel.getByRole("button", { name: "关闭使用帮助" }).click();
      await expect(panel.getByRole("region", { name: "使用帮助" })).toHaveCount(0);
      const support = panel.getByRole("button", { name: "客服", exact: true });
      await support.click();
      await expect(panel.getByRole("region", { name: "联系客服" })).toContainText("客服二维码即将上线");
      await help.click();
      await expect(panel.getByRole("region", { name: "联系客服" })).toHaveCount(0);
      await expect(panel.getByRole("region", { name: "使用帮助" })).toBeVisible();
      await support.click();
      await expect(panel.getByRole("region", { name: "使用帮助" })).toHaveCount(0);
      await support.press("Escape");
      await expect(panel.getByRole("region", { name: "联系客服" })).toHaveCount(0);
      for (const entry of [official, link]) {
        await test.step(`打开${await entry.innerText()}`, async () => {
          // 每个入口从新加载的面板独立验证，避免关闭新标签页后复用失焦的 iframe。
          await page.reload();
          await page.getByRole("button", { name: "打开极速海投简历助手" }).click();
          const opened = context.waitForEvent("page");
          await entry.focus();
          if (width === 320) {
            await expect(entry).toBeFocused();
            await entry.press("Enter");
          } else {
            await entry.click();
          }
          const destination = await opened;
          await expect(destination).toHaveURL("https://offer.gfjianli.com/");
          // 两个入口都通过新标签页打开，不能操作原申请表。
          expect(await destination.evaluate(() => window.opener === null)).toBe(true);
          await destination.close();
          await page.bringToFront();
        });
      }
      await expect(page).toHaveURL("http://127.0.0.1:4173/simple.html");
      await expect(link).toBeVisible();
    } finally {
      await context.close();
    }
  });
}
