import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "../../scripts/browser-executable.mjs";
const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.output/chrome-mv3");

for (const width of [1280, 320]) {
  test(`贴边快捷填写和拖动在 ${width}px 窗口正常工作`, async () => {
    const context = await chromium.launchPersistentContext("", {
      headless: true, executablePath: resolveBrowserExecutable("chromium"), viewport: { width, height: 900 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      await worker.evaluate(async () => {
        const original = globalThis.fetch;
        globalThis.fetch = (input, init) => String(input).includes("/auth/c/getLoginUser/offer")
          ? Promise.resolve(new Response(JSON.stringify({ code: 200, data: { nickname: "测试同学" } }), { headers: { "content-type": "application/json" } }))
          : String(input).startsWith("https://api.gfjianli.com/api/") ? Promise.reject(new Error("测试离线缓存")) : original(input, init);
        await chrome.storage.local.set({ extensionToken: "fixture-token", fillStats: null,
          "resumeCache:list": { value: [{ id: "dock-fixture", title: "脱敏简历" }], savedAt: Date.now() },
          "resumeCache:profile:dock-fixture": { value: { basic: { name: "测试同学", phone: "13800138000", email: "test@example.com" }, education: [], workExperience: [], projectExperience: [], skills: [], selfIntroduction: "" }, savedAt: Date.now() }
        });
      });
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/simple.html");
      const dock = page.locator("#offer-star-floating-dock");
      const launcher = page.getByRole("button", { name: "打开极速海投简历助手", exact: true });
      await expect(dock).toHaveAttribute("data-expanded", "false");
      await expect.poll(async () => { const r = await dock.boundingBox(); return Math.round(r!.x + r!.width); }).toBe(width);
      await dock.hover();
      await expect(dock).toHaveAttribute("data-expanded", "true");
      await expect(page.getByRole("button", { name: "快捷填写", exact: true })).toBeVisible();
      await expect.poll(async () => (await dock.boundingBox())!.width).toBe(Math.min(350, width));
      await page.screenshot({ path: test.info().outputPath(`dock-idle-${width}.png`) });
      // 网页脚本代点不能启动填写；悬停也不会创建简历 iframe。
      await page.locator("#offer-star-floating-fill").evaluate((button) => (button as HTMLButtonElement).click());
      await expect(page.locator("#offer-star-floating-panel")).toHaveCount(0);
      await page.evaluate(() => {
        const dock = document.getElementById("offer-star-floating-dock")!;
        const observed = (window as unknown as { dockStates: string[] }); observed.dockStates = [];
        new MutationObserver(() => observed.dockStates.push(dock.dataset.state!)).observe(dock, { attributes: true, attributeFilter: ["data-state"] });
      });
      await page.getByRole("button", { name: "快捷填写", exact: true }).click();
      try { await expect(dock).toHaveAttribute("data-state", "success"); }
      catch (error) {
        console.log("快捷填写诊断：", await page.locator("#offer-star-floating-panel").getAttribute("data-ready"), await page.frameLocator("#offer-star-floating-panel iframe").locator(".status-banner").textContent());
        throw error;
      }
      await expect(page.locator('input[name="name"]')).toHaveValue("测试同学");
      await expect(page.locator('input[name="phone"]')).toHaveValue("13800138000");
      await expect(page.locator("#offer-star-floating-panel")).toBeHidden();
      const states = await page.evaluate(() => (window as unknown as { dockStates: string[] }).dockStates);
      expect(states).toEqual(expect.arrayContaining(["loading", "scanning", "success"]));
      await dock.hover();
      await page.screenshot({ path: test.info().outputPath(`dock-success-${width}.png`) });
      await launcher.click();
      const outer = page.locator("#offer-star-floating-panel");
      const panel = page.frameLocator("#offer-star-floating-panel iframe");
      await expect(outer).toBeVisible();
      await expect(panel.locator(".application-stat strong").last()).toHaveText("1次");
      // 宿主网页 postMessage 或其他标签页/后台发来的命令不能触发填写。
      await page.locator('input[name="name"]').fill("");
      await page.evaluate(() => (document.querySelector("#offer-star-floating-panel iframe") as HTMLIFrameElement).contentWindow!.postMessage({ type: "FLOATING_FILL_COMMAND", action: "start" }, "*"));
      await worker.evaluate(() => chrome.runtime.sendMessage({ type: "FLOATING_FILL_COMMAND", action: "start" }).catch(() => undefined));
      await expect(page.locator('input[name="name"]')).toHaveValue("");
      const before = (await outer.boundingBox())!;
      const brand = (await panel.locator(".brand-lockup").boundingBox())!;
      await page.mouse.move(brand.x + 5, brand.y + 5);
      await page.mouse.down();
      await page.mouse.move(brand.x + 5 - (width === 1280 ? 250 : 4), brand.y - 115, { steps: 12 });
      await page.mouse.up();
      await expect.poll(async () => Math.round((await outer.boundingBox())!.y)).toBe(Math.round(before.y - 120));
      const moved = (await outer.boundingBox())!;
      expect(moved.x).toBeGreaterThanOrEqual(0);
      expect(moved.x + moved.width).toBeLessThanOrEqual(width);
      await panel.locator(".panel-header").focus();
      await panel.locator(".panel-header").press("ArrowUp");
      await expect.poll(async () => Math.round((await outer.boundingBox())!.y)).toBe(Math.round(moved.y - 10));
      await page.screenshot({ path: test.info().outputPath(`panel-dragged-${width}.png`) });
      const remembered = (await outer.boundingBox())!;
      await panel.getByRole("button", { name: "关闭悬浮面板" }).click();
      await launcher.click();
      await expect.poll(async () => Math.round((await outer.boundingBox())!.y)).toBe(Math.round(remembered.y));
      await panel.getByRole("button", { name: "关闭悬浮面板" }).click();
      // 拖动入口不误开面板，并吸附到最近侧边。
      await dock.hover();
      const icon = (await launcher.boundingBox())!;
      const dockBefore = (await dock.boundingBox())!;
      await page.mouse.move(icon.x + 18, icon.y + 18); await page.mouse.down();
      await page.mouse.move(25, dockBefore.y - 150, { steps: 15 }); await page.mouse.up();
      await expect(page.locator("#offer-star-floating-panel")).toHaveCount(0);
      await expect.poll(async () => Math.round((await dock.boundingBox())!.x)).toBe(0);
      await launcher.focus(); await launcher.press("ArrowRight");
      await expect.poll(async () => { const r = (await dock.boundingBox())!; return Math.round(r.x + r.width); }).toBe(width);
      await page.setViewportSize({ width, height: 420 });
      await expect.poll(async () => { const r = (await dock.boundingBox())!; return r.y >= 0 && r.y + r.height <= 420; }).toBe(true);
      await launcher.click();
      await expect.poll(async () => { const r = (await outer.boundingBox())!; return r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= 420; }).toBe(true);
      // 无简历也展示真实状态，并提供完善入口。
      await worker.evaluate(() => chrome.storage.local.set({ "resumeCache:list": { value: [], savedAt: Date.now() } }));
      await page.setViewportSize({ width, height: 900 }); await page.reload();
      await dock.hover(); await page.getByRole("button", { name: "快捷填写", exact: true }).click();
      await expect(dock).toHaveAttribute("data-state", "missing");
      await dock.hover(); await expect(page.getByRole("button", { name: "完善简历", exact: true })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`dock-missing-${width}.png`) });
      await context.route("https://gfjianli.com/", (route) => route.fulfill({ contentType: "text/html", body: "<title>完善简历测试页</title>" }));
      const destination = context.waitForEvent("page");
      await page.getByRole("button", { name: "完善简历", exact: true }).click();
      const editor = await destination;
      await expect(editor).toHaveURL("https://gfjianli.com/");
      expect(await editor.evaluate(() => window.opener === null)).toBe(true);
      await editor.close();
      // 模拟官网创建简历后的重试，重新读取列表，不要求用户刷新页面。
      await worker.evaluate(() => chrome.storage.local.set({ "resumeCache:list": { value: [{ id: "dock-fixture", title: "脱敏简历" }], savedAt: Date.now() } }));
      await page.getByRole("button", { name: "重新填写", exact: true }).click();
      await expect(dock).toHaveAttribute("data-state", "success");
      // 安全验证页只提示人工处理，快捷入口同样不能绕过。
      await context.route("http://127.0.0.1:4173/_security_check", (route) => route.fulfill({ contentType: "text/html", body: '<title>安全验证测试</title><label>姓名<input name="name"></label><p>请完成安全验证</p>' }));
      await page.goto("http://127.0.0.1:4173/_security_check");
      await dock.hover(); await page.getByRole("button", { name: "快捷填写", exact: true }).click();
      await expect(dock).toHaveAttribute("data-state", "blocked");
      await expect(page.locator('input[name="name"]')).toHaveValue("");
    } finally { await context.close(); }
  });
}
