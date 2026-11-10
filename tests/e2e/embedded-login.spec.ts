import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "../../scripts/browser-executable.mjs";
const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.output/chrome-mv3");
for (const width of [1280, 320]) {
  test(`插件内扫码在 ${width}px 展示并安全接收登录回调`, async () => {
    test.setTimeout(35000);
    const context = await chromium.launchPersistentContext("", { headless: true, executablePath: resolveBrowserExecutable("chromium"), viewport: { width, height: 900 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      await worker.evaluate(async () => {
        const url = new URL("https://open.weixin.qq.com/connect/qrconnect");
        url.searchParams.set("appid", "fixture-app"); url.searchParams.set("state", "fixture-state"); url.searchParams.set("scope", "snsapi_login");
        url.searchParams.set("redirect_uri", "https://api.gfjianli.com/api/oauth/resume/callback/wechat");
        globalThis.fetch = (input, init) => {
          if (String(input).includes("/oauth/resume/render/wechat")) return Promise.resolve(new Response(JSON.stringify({ code: 200, data: url.href })));
          if (String(input).includes("/auth/c/getLoginUser/offer") && new Headers(init?.headers).get("token") === "fixture-invalid") return Promise.resolve(new Response(JSON.stringify({ code: 401 }), { status: 401 }));
          if (String(input).includes("/auth/c/getLoginUser/offer")) return Promise.resolve(new Response(JSON.stringify({ code: 200, data: { nickname: "测试同学" } })));
          return Promise.reject(new Error("脱敏扫码测试不访问生产服务"));
        };
        await chrome.storage.local.set({ "resumeCache:list": { value: [{ id: "fixture", title: "测试简历" }], savedAt: Date.now() }, "resumeCache:profile:fixture": { value: { basic: { name: "测试同学" }, education: [], workExperience: [], skills: [] }, savedAt: Date.now() } });
      });
      await context.route("https://open.weixin.qq.com/**", (route) => route.fulfill({ contentType: "text/html", body: `<meta charset="utf-8"><div style="width:220px;height:220px;margin:20px auto;background:#eef4ff;display:grid;place-items:center">扫码测试占位</div><script>window.parent.postMessage(JSON.stringify({type:'status',status:'wxQRcodeReady'}),'*')</script>` }));
      await context.route("https://jisuhaitou.gfjianli.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>脱敏登录回调</title>" }));
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/simple.html");
      if (width === 320) {
        await page.locator("#offer-star-floating-dock").hover();
        await page.getByRole("button", { name: "快捷填写", exact: true }).click();
      } else await page.getByRole("button", { name: "打开极速海投简历助手", exact: true }).click();
      const panel = page.frameLocator("#offer-star-floating-panel iframe");
      await expect(panel.getByRole("heading", { name: "扫码注册登录" })).toBeVisible();
      await expect(panel.locator(".login-frame-shell")).toHaveAttribute("data-phase", "ready");
      await expect(panel.locator("iframe[title='微信扫码登录二维码']")).toBeVisible();
      await expect(panel.locator(".panel-footer")).toBeInViewport({ ratio: 1 });
      expect(await panel.locator("main").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`embedded-login-${width}.png`) });
      await panel.getByRole("button", { name: "刷新二维码", exact: true }).click();
      await expect(panel.locator(".login-frame-shell")).toHaveAttribute("data-phase", "ready");
      expect(context.pages()).toHaveLength(2);
      // 申请网页伪造消息不得写入扩展登录态。
      await page.evaluate(() => (document.querySelector("#offer-star-floating-panel iframe") as HTMLIFrameElement).contentWindow!.postMessage({ type: "OFFER_STAR_EMBEDDED_LOGIN_RESULT", token: "fixture-attacker" }, "*"));
      expect(await worker.evaluate(async () => (await chrome.storage.local.get("extensionToken")).extensionToken)).toBeUndefined();
      let loginFrame = page.frames().find((frame) => frame.url().startsWith("https://open.weixin.qq.com/"))!;
      await loginFrame.goto("https://jisuhaitou.gfjianli.com/callback?token=fixture-invalid");
      await expect(panel.getByText("二维码暂未加载成功", { exact: true })).toBeVisible();
      expect(await worker.evaluate(async () => (await chrome.storage.local.get("extensionToken")).extensionToken)).toBeUndefined();
      await panel.getByRole("button", { name: "刷新二维码", exact: true }).click();
      await expect(panel.locator(".login-frame-shell")).toHaveAttribute("data-phase", "ready");
      loginFrame = page.frames().find((frame) => frame.url().startsWith("https://open.weixin.qq.com/"))!;
      await loginFrame.goto("https://jisuhaitou.gfjianli.com/callback?token=fixture-good");
      await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get("extensionToken")).extensionToken)).toBe("fixture-good");
      await expect(panel.getByRole("tab", { name: "自动填充", exact: true })).toBeVisible();
      await expect(panel.getByRole("heading", { name: "扫码注册登录" })).toHaveCount(0);
      expect(await worker.evaluate(async () => (await chrome.storage.local.get("extensionToken")).extensionToken)).toBe("fixture-good");
    } finally { await context.close(); }
  });
}
