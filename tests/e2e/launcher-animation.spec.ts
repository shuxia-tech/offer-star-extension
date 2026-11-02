import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "../../scripts/browser-executable.mjs";
const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.output/chrome-mv3");

for (const width of [1280, 320]) {
  test(`悬浮条在 ${width}px 窗口平滑过渡且纸飞机独立往返`, async () => {
    const context = await chromium.launchPersistentContext("", {
      headless: true, executablePath: resolveBrowserExecutable("chromium"), viewport: { width, height: 900 }, deviceScaleFactor: 2,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    try {
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/simple.html");
      const dock = page.locator("#offer-star-floating-dock");
      const plane = page.locator("#offer-star-floating-plane");
      await expect(dock).toHaveAttribute("data-motion", "running");
      const flight = await plane.evaluate((node) => {
        const animation = node.getAnimations()[0]; animation.pause(); animation.currentTime = 0;
        const initial = node.getBoundingClientRect();
        const base = node.previousElementSibling!; const baseBefore = base.getBoundingClientRect();
        animation.currentTime = 2300; const outbound = node.getBoundingClientRect();
        animation.currentTime = 3450; const returning = node.getBoundingClientRect();
        animation.currentTime = 4600; const end = node.getBoundingClientRect();
        const baseAfter = base.getBoundingClientRect(); animation.currentTime = 2300;
        return { moved: Math.abs(outbound.x - initial.x) > 10 && outbound.y < initial.y - 8, returning: returning.x > outbound.x, ended: Math.abs(end.x - initial.x) < .5, baseStill: baseBefore.x === baseAfter.x && baseBefore.y === baseAfter.y };
      });
      expect(flight).toEqual({ moved: true, returning: true, ended: true, baseStill: true });
      const rect = (await dock.boundingBox())!;
      const clip = { x: Math.max(0, width - 260), y: Math.max(0, rect.y - 70), width: Math.min(260, width), height: 140 };
      await page.screenshot({ path: test.info().outputPath(`plane-flight-${width}.png`), clip });
      await dock.hover();
      await expect.poll(() => plane.evaluate((node) => node.getAnimations().length)).toBe(0);
      await expect.poll(() => dock.evaluate((node) => Math.abs(node.getBoundingClientRect().width - Number.parseFloat(node.style.width)) < .5)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`dock-expanded-${width}.png`), clip });
      // 快速移出后马上返回，过渡从当前位置反向，不跳到收起或展开终点。
      await page.mouse.move(2, 2);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      await page.mouse.move(width - 8, rect.y + 24);
      await expect(dock).toHaveAttribute("data-expanded", "true");
      await expect.poll(() => dock.evaluate((node) => Math.abs(node.getBoundingClientRect().width - Number.parseFloat(node.style.width)) < .5)).toBe(true);
      await page.mouse.move(2, 2);
      await expect(dock).toHaveCSS("width", "48px");
      await expect(dock).toHaveAttribute("data-motion", "running");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(dock).toHaveAttribute("data-motion", "paused");
      await expect.poll(() => plane.evaluate((node) => node.getAnimations().length)).toBe(0);
      await dock.hover();
      await expect(dock).toHaveAttribute("data-expanded", "true");
      await expect(dock).toHaveCSS("transition-duration", "0s");
      expect((await dock.boundingBox())!.width).toBeLessThanOrEqual(width);
    } finally { await context.close(); }
  });
}
