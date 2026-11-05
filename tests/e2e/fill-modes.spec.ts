import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "../../scripts/browser-executable.mjs";
const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.output/chrome-mv3");

for (const width of [1280, 320]) {
  test(`增量与框选填写在 ${width}px 保留已有内容和区域边界`, async () => {
    test.setTimeout(45000);
    const context = await chromium.launchPersistentContext("", {
      headless: true, executablePath: resolveBrowserExecutable("chromium"), viewport: { width, height: 900 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      await worker.evaluate(async () => {
        globalThis.fetch = (input) => String(input).includes("/auth/c/getLoginUser/offer") ? Promise.resolve(new Response(JSON.stringify({ code: 200, data: { nickname: "测试同学" } }), { headers: { "content-type": "application/json" } })) : Promise.reject(new Error("脱敏夹具不访问生产服务"));
        await chrome.storage.local.set({ extensionToken: "fixture-token", selectedResumeId: "fixture",
          "resumeCache:list": { value: [{ id: "fixture", title: "测试简历" }], savedAt: Date.now() },
          "resumeCache:profile:fixture": { value: { basic: { name: "测试同学", email: "fixture@example.com" }, education: [], workExperience: [], skills: [], selfIntroduction: "测试介绍" }, savedAt: Date.now() }
        });
      });
      const page = await context.newPage();
      await page.route("**/fill-modes.html", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><meta charset="utf-8"><style>body{margin:0}#form{position:absolute;top:120px;left:16px;width:210px}input,textarea{box-sizing:border-box;display:block;width:200px;height:34px;margin:8px 0 20px}</style><div id="form"><div><span>姓名</span><input id="name" value="用户已填写"></div><div><span>邮箱</span><input id="email" type="email"></div><div><span>自我介绍</span><textarea id="intro"></textarea></div></div>` }));
      await page.goto("http://127.0.0.1:4173/fill-modes.html");
      await page.getByRole("button", { name: "打开极速海投简历助手", exact: true }).click();
      const panel = page.frameLocator("#offer-star-floating-panel iframe");
      await expect(panel.getByRole("button", { name: "增量填写", exact: true })).toBeEnabled();
      await panel.getByRole("button", { name: "增量填写说明", exact: true }).click();
      await expect(panel.getByRole("note")).toContainText("保留已有内容");
      await expect.poll(() => panel.locator("main").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`fill-tools-${width}.png`) });
      await panel.getByRole("button", { name: "增量填写", exact: true }).click();
      await expect(page.locator("#email")).toHaveValue("fixture@example.com");
      await expect(page.locator("#name")).toHaveValue("用户已填写");
      await expect(panel.locator(".status-banner")).toContainText("已有内容保持不变");
      await page.evaluate(() => { for (const id of ["name", "email", "intro"]) (document.getElementById(id) as HTMLInputElement).value = ""; });
      await panel.getByRole("button", { name: "选区填写", exact: true }).click();
      await expect(page.locator("#offer-star-region-selector")).toBeVisible();
      await expect(page.locator("#offer-star-floating-panel")).toBeHidden();
      const box = (await page.locator("#name").boundingBox())!;
      // 从右下向左上反向框选同样有效，不能顺带填写外面的邮箱和介绍。
      await page.mouse.move(box.x + box.width + 3, box.y + box.height + 3); await page.mouse.down();
      await page.mouse.move(box.x - 3, box.y - 3, { steps: 8 });
      await page.screenshot({ path: test.info().outputPath(`region-drag-${width}.png`) });
      await page.mouse.up();
      await expect(page.locator("#offer-star-region-selector")).toHaveCount(0);
      await expect(page.locator("#name")).toHaveValue("测试同学");
      await expect(page.locator("#email")).toHaveValue(""); await expect(page.locator("#intro")).toHaveValue("");
      await expect(panel.locator(".status-banner")).toContainText("已填入选中区域");
      await panel.getByRole("button", { name: "选区填写", exact: true }).click();
      await expect(page.locator("#offer-star-region-selector")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel.locator(".status-banner")).toContainText("已取消选区填写");
      await expect(page.locator("#offer-star-region-selector")).toHaveCount(0);
      await panel.getByRole("button", { name: "选区填写", exact: true }).click();
      await expect(page.locator("#offer-star-region-selector")).toBeVisible();
      await page.mouse.move(15, 55); await page.mouse.down(); await page.mouse.move(100, 85); await page.mouse.up();
      await expect(panel.locator(".status-banner")).toContainText("选区内没有识别到");
      await expect(page.locator("#email")).toHaveValue("");
      // 同源 iframe 的坐标需要换算到网页坐标；不能误填相邻 Shadow DOM 控件。
      await page.evaluate(() => {
        document.getElementById("form")!.remove();
        const child = document.createElement("iframe"); child.id = "child";
        child.style.cssText = "position:absolute;top:120px;left:16px;width:210px;height:90px;border:4px solid #eee";
        document.body.appendChild(child);
        child.contentDocument!.body.innerHTML = '<div><span>邮箱</span><input id="frame-email" type="email" style="display:block;width:160px;height:30px"></div>';
        const host = document.createElement("div"); host.id = "shadow-host";
        host.style.cssText = "position:absolute;top:280px;left:16px";
        host.attachShadow({ mode: "open" }).innerHTML = '<div><span>姓名</span><input id="shadow-name" style="display:block;width:160px;height:30px"></div>';
        document.body.appendChild(host);
      });
      const frameEmail = page.frameLocator("#child").locator("#frame-email");
      await panel.getByRole("button", { name: "选区填写", exact: true }).click();
      await expect(page.locator("#offer-star-region-selector")).toBeVisible();
      const inside = (await frameEmail.boundingBox())!;
      await page.mouse.move(inside.x - 2, inside.y - 2); await page.mouse.down();
      await page.mouse.move(inside.x + inside.width + 2, inside.y + inside.height + 2, { steps: 5 }); await page.mouse.up();
      await expect(frameEmail).toHaveValue("fixture@example.com");
      await expect(page.locator("#shadow-name")).toHaveValue("");
      await panel.getByRole("button", { name: "选区填写", exact: true }).click();
      await expect(page.locator("#offer-star-region-selector")).toBeVisible();
      const shadow = (await page.locator("#shadow-name").boundingBox())!;
      await page.mouse.move(shadow.x - 2, shadow.y - 2); await page.mouse.down();
      await page.mouse.move(shadow.x + shadow.width + 2, shadow.y + shadow.height + 2, { steps: 5 }); await page.mouse.up();
      await expect(page.locator("#shadow-name")).toHaveValue("测试同学");
    } finally { await context.close(); }
  });
}
