import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "../../scripts/browser-executable.mjs";

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.output/chrome-mv3");
const headed = process.env.EXTENSION_E2E_HEADED === "1";

test("真实扩展可以通过本地 AI 网关审核并拒绝草稿", async () => {
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  try {
    context = await chromium.launchPersistentContext("", {
      headless: !headed,
      executablePath: resolveBrowserExecutable("chromium"),
      args: [...(headed ? [] : ["--headless=new"]), `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    page = await context.newPage();
    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await serviceWorker.evaluate(async () => {
      const originalFetch = globalThis.fetch;
      // 仅让简历 API 离线以使用脱敏缓存；本地 AI 网关仍走真实网络请求。
      globalThis.fetch = (input, init) => {
        if (String(input).startsWith("https://api.gfjianli.com/api/")) return Promise.reject(new Error("测试夹具模拟简历服务离线"));
        return originalFetch(input, init);
      };
      const now = Date.now();
      await chrome.storage.local.clear();
      await chrome.storage.local.set({
        extensionToken: "e2e-ai-token",
        "resumeCache:list": { value: [{ id: "e2e-ai-resume", title: "AI 审核测试简历" }], savedAt: now },
        "resumeCache:profile:e2e-ai-resume": {
          value: {
            basic: { name: "AI 测试用户", phone: "13800000000", email: "ai@example.com" },
            education: [], workExperience: [], projectExperience: [], skills: ["TypeScript"], selfIntroduction: "有招聘产品经验"
          },
          savedAt: now
        }
      });
    });
    const gatewayRequest = context.waitForEvent("request", {
      predicate: (request) => request.url().endsWith("/api/mock-ai") && request.method() === "POST"
    });
    await page.goto("http://127.0.0.1:4173/simple.html?email=url-private%40example.com&phone=13812345678#private-fragment");
    await page.getByRole("button", { name: "打开极速海投简历助手" }).click();
    const panel = page.frameLocator("#offer-star-floating-panel iframe");
    await expect(panel.getByText("AI 审核测试简历")).toBeVisible();
    await panel.getByRole("button", { name: "扫描当前页面" }).click();
    await panel.locator(".advanced-tools > summary").click();
    const aiButton = panel.getByRole("button", { name: "AI 分析未识别字段" });
    await panel.getByRole("textbox", { name: "职位描述" }).fill("职位联系 text-private@example.com，13812345678，身份证 110101199001011234");
    await aiButton.click();
    const body = (await gatewayRequest).postDataJSON();
    expect(body.pageUrl).toBe("http://127.0.0.1:4173/simple.html");
    expect(JSON.stringify(body)).not.toMatch(/url-private|text-private|13812345678|110101199001011234|private-fragment/);
    await expect(panel.getByRole("button", { name: "AI 分析中…" })).toBeDisabled();
    await expect(panel.getByText("分析完成")).toBeVisible();
    const draft = panel.locator(".draft-card textarea");
    await expect(draft).toHaveValue("建议候选文案");
    await draft.fill("用户确认后的自定义文案");
    await panel.getByRole("button", { name: "删除" }).click();
    await expect(panel.locator(".draft-card")).toHaveCount(0);
  } finally {
    const worker = context?.serviceWorkers()[0];
    if (worker) await worker.evaluate(async () => chrome.storage.local.clear());
    await page?.close();
    await context?.close();
  }
});
