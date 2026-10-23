import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "../../scripts/browser-executable.mjs";

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.output/chrome-mv3");
let context: BrowserContext;
let page: Page;
const headed = process.env.EXTENSION_E2E_HEADED === "1";
const forceExtensionAssertions = process.env.EXTENSION_E2E_ASSERT_EXTENSION === "1";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext("", {
    headless: !headed,
    executablePath: resolveBrowserExecutable("chromium"),
    args: [...(headed ? [] : ["--headless=new"]), `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  page = await context.newPage();
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await worker.evaluate(() => {
    const originalFetch = globalThis.fetch;
    // 缓存夹具只验证断网回退，不能拿虚构 token 请求生产接口并忽略其 401。
    globalThis.fetch = (input, init) => {
      if (String(input).startsWith("https://api.gfjianli.com/api/")) return Promise.reject(new Error("测试夹具模拟简历服务离线"));
      return originalFetch(input, init);
    };
  });
});

test.afterAll(async () => {
  await context?.close();
});

test("扩展会在测试页面注入网页悬浮入口", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前 Playwright 无头运行时未加载扩展 service worker，需要使用带界面的 Chromium 或手动加载扩展验证"
  );
  await page.goto("http://127.0.0.1:4173/");
  await page.waitForTimeout(1000);
  await expect(page.locator("#offer-star-floating-launcher")).toBeVisible();
  await expect(page.locator("#offer-star-floating-launcher")).toHaveAttribute("title", "打开 Offer Star 简历助手");
  await expect(page.locator("#offer-star-floating-launcher")).toHaveAttribute("aria-controls", "offer-star-floating-panel");
  await expect(page.getByRole("button", { name: "打开 Offer Star 简历助手" })).toBeVisible();
  await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
  await expect(page.locator("#offer-star-floating-panel")).toBeVisible();
  await expect(page.locator("#offer-star-floating-panel")).toHaveAttribute("aria-modal", "false");
  await expect(page.locator("#offer-star-floating-launcher")).toBeHidden();
  await expect(page.locator("#offer-star-floating-panel iframe")).toHaveAttribute("title", "Offer Star 简历助手悬浮面板");
  const panel = page.frameLocator("#offer-star-floating-panel iframe");
  await expect(panel.locator("h2")).toHaveText("Offer Star");
  await expect(panel.locator("section.resume-card")).toHaveAttribute("aria-busy", "false");
  await expect(panel.locator("h2")).toHaveCSS("white-space", "nowrap");
  await expect.poll(() => panel.locator("h2").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(panel.locator(".brand-mark")).toHaveText("★");
  await expect(panel.locator("svg.panel-icon").first()).toBeVisible();
  await expect(panel.locator(".brand-mark")).toHaveCSS("border-radius", "10px");
  await expect(panel.locator(".status-banner")).toBeVisible();
  await expect(panel.locator(".status-banner")).toHaveCSS("border-radius", "10px");
  await expect(panel.getByRole("button", { name: "扫描当前页面" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("panel-visual-desktop.png") });
  await panel.getByRole("button", { name: "扫描当前页面" }).click();
  await expect(panel.getByText(/识别到 \d+ 个字段/)).toBeVisible();
  await expect(panel.locator(".page-context-card")).toContainText("通用网申页面");
  await expect(panel.locator(".page-context-card")).toContainText("测试网申表单");
  await expect(panel.locator(".field-summary")).toBeVisible();
  await expect(panel.locator(".advanced-tools")).toBeVisible();
  await expect(panel.getByRole("button", { name: "选择照片或附件" })).toBeVisible();
  await panel.locator('input[aria-label="选择照片或附件文件"]').setInputFiles({ name: "ui-resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(panel.getByText("ui-resume.pdf")).toBeVisible();
  await panel.getByRole("button", { name: "关闭悬浮面板" }).click();
  await expect(page.locator("#offer-star-floating-panel")).toHaveCount(0);
  await expect(page.locator("#offer-star-floating-launcher")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
  const compactPanel = page.frameLocator("#offer-star-floating-panel iframe");
  await expect(compactPanel.locator("h2")).toHaveCSS("white-space", "nowrap");
  await expect.poll(() => compactPanel.locator("h2").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect.poll(() => compactPanel.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("panel-visual-narrow.png") });
  await compactPanel.getByRole("button", { name: "关闭悬浮面板" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("未登录时点击登录按钮会打开 Offer Star 官网", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前 Playwright 无头运行时未加载扩展 service worker，需要使用带界面的 Chromium 或手动加载扩展验证"
  );
  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
  const panel = page.frameLocator("#offer-star-floating-panel iframe");
  await expect(panel.getByText("未登录")).toBeVisible();
  await expect(panel.locator("section.resume-card").getByText("请先登录并创建简历", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "打开 Offer Star 登录" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "刷新登录状态" })).toBeVisible();
  await panel.getByRole("button", { name: "刷新登录状态" }).click();
  await expect(panel.locator(".status-banner")).toContainText("未找到同一浏览器中的 Offer Star 官网");
  const before = new Set(context.pages());
  await panel.getByRole("button", { name: "打开 Offer Star 登录" }).click();
  await expect.poll(() => context.pages().filter((candidate) => !before.has(candidate)).length).toBe(1);
  const loginPage = context.pages().find((candidate) => !before.has(candidate));
  expect(loginPage).toBeTruthy();
  await expect(loginPage!).toHaveURL(/https:\/\/offer\.gfjianli\.com\/extension-login|https:\/\/open\.weixin\.qq\.com\//);
  await expect(panel.locator(".status-banner")).toContainText("已打开微信扫码窗口");
  await loginPage!.close();
});

test("安全验证页面不会进入字段填写流程", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前 Playwright 无头运行时未加载扩展 service worker，需要使用带界面的 Chromium 或手动加载扩展验证"
  );
  await page.goto("http://127.0.0.1:4173/?_security_check=1");
  await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
  const panel = page.frameLocator("#offer-star-floating-panel iframe");
  await panel.getByRole("button", { name: "扫描当前页面" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "安全验证" })).toHaveClass(/status-security/);
  await expect(panel.locator(".field-summary")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "一键填写" })).toHaveCount(0);
  await panel.getByRole("button", { name: "关闭悬浮面板" }).click();
});

test("空扫描结果会显示重新扫描入口", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前 Playwright 无头运行时未加载扩展 service worker，需要使用带界面的 Chromium 或手动加载扩展验证"
  );
  await page.goto("http://127.0.0.1:4173/empty.html");
  await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
  const panel = page.frameLocator("#offer-star-floating-panel iframe");
  await panel.getByRole("button", { name: "扫描当前页面" }).click();
  await expect(panel.locator(".empty-scan-card")).toBeVisible();
  await expect(panel.getByText("暂未识别到可填写字段", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "重新扫描" })).toBeVisible();
  await panel.getByRole("button", { name: "重新扫描" }).click();
  await expect(panel.locator(".empty-scan-card")).toBeVisible();
  await panel.getByRole("button", { name: "关闭悬浮面板" }).click();
});

test("页面刷新后不会重复注入悬浮入口", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前 Playwright 无头运行时未加载扩展 service worker，需要使用带界面的 Chromium 或手动加载扩展验证"
  );
  await page.reload();
  await expect(page.locator("#offer-star-floating-launcher")).toHaveCount(1);
});

test("工具栏触发消息也会打开网页内悬浮面板", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前 Playwright 无头运行时未加载扩展 service worker，需要使用带界面的 Chromium 或手动加载扩展验证"
  );
  await page.goto("http://127.0.0.1:4173/");
  const serviceWorker = context.serviceWorkers()[0];
  await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) throw new Error("没有找到测试页面标签页");
    await chrome.tabs.sendMessage(tab.id, { type: "OPEN_FLOATING_PANEL" });
  });
  await expect(page.locator("#offer-star-floating-panel")).toBeVisible();
  await expect(page.locator("#offer-star-floating-launcher")).toBeHidden();
  await page.frameLocator("#offer-star-floating-panel iframe").getByRole("button", { name: "关闭悬浮面板" }).click();
  await expect(page.locator("#offer-star-floating-panel")).toHaveCount(0);
});

test("真实浏览器可以扫描通用表单并拒绝非法值", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前 Playwright 无头运行时未加载扩展 service worker，需要使用带界面的 Chromium 或手动加载扩展验证"
  );
  await page.goto("http://127.0.0.1:4173/");
  const serviceWorker = context.serviceWorkers()[0];
  const scan = await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) throw new Error("没有找到测试页面标签页");
    return await chrome.tabs.sendMessage(tab.id, { type: "SCAN_PAGE" });
  });
  expect(scan.fields.map((field: { key: string | null }) => field.key)).toEqual(expect.arrayContaining(["name", "phone", "email"]));

  const validResult = await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) throw new Error("没有找到测试页面标签页");
    return await chrome.tabs.sendMessage(tab.id, {
      type: "FILL_FIELDS",
      values: { name: "Edge 测试用户", phone: "13800000000", email: "edge@example.com" },
      mode: "overwrite"
    });
  });
  expect(validResult.filled).toEqual(expect.arrayContaining(["name", "phone", "email"]));
  await expect(page.locator('input[name="email"]')).toHaveValue("edge@example.com");

  const invalidResult = await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) throw new Error("没有找到测试页面标签页");
    return await chrome.tabs.sendMessage(tab.id, {
      type: "FILL_FIELDS",
      values: { phone: "123", email: "not-an-email" },
      mode: "overwrite"
    });
  });
  expect(invalidResult.filled).toEqual([]);
  expect(invalidResult.failureReasons).toEqual({ phone: "手机号或电话格式不合法", email: "邮箱格式不合法" });
  await expect(page.locator('input[name="phone"]')).toHaveValue("13800000000");
  await expect(page.locator('input[name="email"]')).toHaveValue("edge@example.com");
});

test("真实浏览器按 accept 类型写入照片和简历附件", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前 Playwright 无头运行时未加载扩展 service worker，需要使用带界面的 Chromium 或手动加载扩展验证"
  );
  await page.goto("http://127.0.0.1:4173/");
  const serviceWorker = context.serviceWorkers()[0];
  const result = await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) throw new Error("没有找到测试页面标签页");
    return await chrome.tabs.sendMessage(tab.id, {
      type: "FILL_FILES",
      files: [
        { dataUrl: "data:image/png;base64,iVBORw0KGgo=", fileName: "profile.png", mimeType: "image/png" },
        { dataUrl: "data:application/pdf;base64,JVBERi0xLjQ=", fileName: "resume.pdf", mimeType: "application/pdf" }
      ]
    });
  });
  expect(result).toMatchObject({ filled: true, count: 2, failed: [] });
  await expect(page.locator("#photo").evaluate((element) => (element as HTMLInputElement).files?.[0]?.name)).resolves.toBe("profile.png");
  await expect(page.locator("#attachment").evaluate((element) => (element as HTMLInputElement).files?.[0]?.name)).resolves.toBe("resume.pdf");
});

test("表单结构异步变化后网页内悬浮面板收到过期提示", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前 Playwright 无头运行时未加载扩展 service worker，需要使用带界面的 Chromium 或手动加载扩展验证"
  );
  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
  const floatingPanel = page.frameLocator("#offer-star-floating-panel iframe");
  await floatingPanel.getByRole("button", { name: "扫描当前页面" }).click();
  await expect(floatingPanel.getByText(/识别到 \d+ 个字段/)).toBeVisible();
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.name = "动态新增字段";
    document.body.appendChild(input);
  });
  await expect(floatingPanel.getByText("页面表单已更新，请重新扫描后再填写")).toBeVisible({ timeout: 5_000 });
  // 超过一次登录轮询后提示仍须保留，不能被未登录兜底清理覆盖。
  await page.waitForTimeout(1100);
  await expect(floatingPanel.getByText("页面表单已更新，请重新扫描后再填写")).toBeVisible();
  await floatingPanel.getByRole("button", { name: "关闭悬浮面板" }).click();
});

test("网页内悬浮面板可以在真实扩展上下文加载", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前运行环境未加载扩展 Service Worker"
  );
  const serviceWorker = context.serviceWorkers()[0];
  const extensionId = serviceWorker?.url().match(/^chrome-extension:\/\/([^/]+)/)?.[1];
  expect(extensionId).toBeTruthy();
  const floatingPanel = await context.newPage();
  await floatingPanel.goto(`chrome-extension://${extensionId}/floating-panel.html?embedded=1&tabId=1`);
  await expect(floatingPanel.getByText("简历助手")).toBeVisible();
  await expect(floatingPanel.getByText("开发版")).toBeVisible();
  await floatingPanel.close();
});

test("登录态可以从缓存加载简历并完成一键填写", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前运行环境未加载扩展 Service Worker"
  );
  const serviceWorker = context.serviceWorkers()[0];
  await serviceWorker.evaluate(async () => {
    const now = Date.now();
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      extensionToken: "e2e-test-token",
      "resumeCache:list": { value: [
        { id: "e2e-resume", title: "E2E 测试简历" },
        { id: "e2e-resume-secondary", title: "备用测试简历" }
      ], savedAt: now },
      "resumeCache:profile:e2e-resume": {
        value: {
          basic: { name: "缓存测试用户", phone: "13800000000", email: "cached@example.com" },
          education: [],
          workExperience: [],
          projectExperience: [],
          skills: []
        },
        savedAt: now
      },
      "resumeCache:profile:e2e-resume-secondary": {
        value: {
          basic: { name: "备用测试用户", phone: "13900000000", email: "secondary@example.com" },
          education: [],
          workExperience: [],
          projectExperience: [],
          skills: []
        },
        savedAt: now
      }
    });
  });
  await page.goto("http://127.0.0.1:4173/simple.html");
  await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
  const panel = page.frameLocator("#offer-star-floating-panel iframe");
  await expect(panel.getByText("已连接")).toBeVisible();
  await expect(panel.getByText("E2E 测试简历")).toBeVisible();
  await expect(panel.getByRole("button", { name: "退出" })).toHaveCSS("border-radius", "10px");
  await panel.getByRole("button", { name: /E2E 测试简历/ }).click();
  await expect(panel.getByRole("option", { name: /备用测试简历/ })).toBeVisible();
  await panel.getByRole("option", { name: /备用测试简历/ }).click();
  await expect(panel.locator(".resume-picker-trigger").getByText("备用测试简历", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "扫描当前页面" }).click();
  await expect(panel.getByText(/识别到 \d+ 个字段/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "一键填写" })).toBeVisible();
  await panel.getByRole("button", { name: "一键填写" }).click();
  await expect(page.locator('input[name="name"]')).toHaveValue("备用测试用户");
  await expect(page.locator('input[name="phone"]')).toHaveValue("13900000000");
  await expect(page.locator('input[name="email"]')).toHaveValue("secondary@example.com");
  await expect(panel.locator(".result-card")).toContainText("填写已完成");
  await expect(panel.locator(".page-context-badge")).toHaveText("已填写");
  await panel.getByRole("button", { name: "撤销本次填写" }).click();
  await expect(page.locator('input[name="name"]')).toHaveValue("");
  await expect(page.locator('input[name="phone"]')).toHaveValue("");
  await expect(page.locator('input[name="email"]')).toHaveValue("");
  await page.locator("body").evaluate(() => {
    const label = document.createElement("label");
    label.htmlFor = "motivation";
    label.textContent = "求职动机";
    const input = document.createElement("input");
    input.id = "motivation";
    input.name = "motivation";
    document.body.append(label, input);
  });
  await panel.getByRole("button", { name: "扫描当前页面" }).click();
  await expect(panel.getByRole("button", { name: "查看匹配结果" })).toBeVisible();
  await panel.getByRole("button", { name: "查看匹配结果" }).click();
  await expect(panel.getByRole("group", { name: "选择填写方式" })).toBeVisible();
  await panel.getByRole("button", { name: "全部覆盖重填" }).click();
  await expect(panel.getByRole("button", { name: "全部覆盖重填" })).toHaveClass(/segment-active/);
  await panel.getByRole("button", { name: "关闭悬浮面板" }).click();
  await expect(page.locator("#offer-star-floating-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
  const reopenedPanel = page.frameLocator("#offer-star-floating-panel iframe");
  await reopenedPanel.getByRole("button", { name: "扫描当前页面" }).click();
  await reopenedPanel.getByRole("button", { name: "查看匹配结果" }).click();
  await expect(reopenedPanel.getByRole("button", { name: "全部覆盖重填" })).toHaveClass(/segment-active/);
  await serviceWorker.evaluate(async () => chrome.storage.local.clear());
});

test("登录态失效时会清空悬浮面板中的旧简历", async () => {
  test.skip(
    context.serviceWorkers().length === 0 && !forceExtensionAssertions,
    "当前运行环境未加载扩展 Service Worker"
  );
  const serviceWorker = context.serviceWorkers()[0];
  await serviceWorker.evaluate(async () => {
    const now = Date.now();
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      extensionToken: "e2e-test-token",
      "resumeCache:list": { value: [{ id: "logout-resume", title: "退出登录测试简历" }], savedAt: now },
      "resumeCache:profile:logout-resume": {
        value: {
          basic: { name: "退出测试用户", phone: "13800000000", email: "logout@example.com" },
          education: [],
          workExperience: [],
          projectExperience: [],
          skills: []
        },
        savedAt: now
      }
    });
  });
  await page.goto("http://127.0.0.1:4173/simple.html");
  await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
  const panel = page.frameLocator("#offer-star-floating-panel iframe");
  await expect(panel.getByText("退出登录测试简历")).toBeVisible();
  await serviceWorker.evaluate(async () => chrome.storage.local.remove("extensionToken"));
  await expect(panel.getByText("未登录")).toBeVisible();
  await expect(panel.locator("section.resume-card").getByText("请先登录并创建简历", { exact: true })).toBeVisible();
  await expect(panel.getByText("退出登录测试简历")).toHaveCount(0);
  await serviceWorker.evaluate(async () => chrome.storage.local.clear());
});

test("简历服务无响应时退出登录检查并允许刷新重试", async () => {
  test.setTimeout(35000);
  const worker = context.serviceWorkers()[0];
  // 在独立测试扩展的实际后台替换网络实现，不读取真实登录数据。
  await worker.evaluate(async () => {
    const scope = globalThis as typeof globalThis & { originalResumeFetch?: typeof fetch };
    scope.originalResumeFetch = globalThis.fetch;
    globalThis.fetch = () => new Promise(() => {});
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ extensionToken: "timeout-fixture-token" });
  });
  try {
    await page.goto("http://127.0.0.1:4173/simple.html");
    await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
    const panel = page.frameLocator("#offer-star-floating-panel iframe");
    await expect(panel.getByText("正在检查登录状态")).toBeVisible();
    await expect(panel.locator(".status-banner")).toContainText("简历服务响应超时", { timeout: 18000 });
    await expect(panel.locator(".resume-card")).toHaveAttribute("aria-busy", "false");
    await worker.evaluate(() => {
      globalThis.fetch = async () => new Response('{"code":200,"data":{"list":[]}}', { status: 200 });
    });
    // 此夹具没有官网授权页，重新打开面板只重试简历请求，不触发官网重同步。
    await panel.getByRole("button", { name: "关闭悬浮面板" }).click();
    await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
    await expect(panel.locator(".status-banner")).toContainText("还没有可用简历");
  } finally {
    await worker.evaluate(async () => {
      const scope = globalThis as typeof globalThis & { originalResumeFetch?: typeof fetch };
      if (scope.originalResumeFetch) globalThis.fetch = scope.originalResumeFetch;
      delete scope.originalResumeFetch;
      await chrome.storage.local.clear();
    });
  }
});

test("官网持久化登录可自动同步且支持相同凭证显式重连", async () => {
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      "resumeCache:list": { savedAt: Date.now(), value: [] }
    });
  });
  const website = await context.newPage();
  await website.route("https://offer.gfjianli.com/**", (route) => route.fulfill({
    contentType: "text/html",
    body: '<html><body><p>脱敏官网登录夹具</p><script>localStorage.removeItem("SECRET_TOKEN");localStorage.setItem("userStore",JSON.stringify({state:{token:"website-fixture-token"}}));</script></body></html>'
  }));
  try {
    await website.goto("https://offer.gfjianli.com/?openLogin=1");
    await expect.poll(() => worker.evaluate(async () => {
      const stored = await chrome.storage.local.get("extensionToken");
      return Boolean(stored.extensionToken);
    })).toBe(true);
    await page.goto("http://127.0.0.1:4173/simple.html");
    await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
    const panel = page.frameLocator("#offer-star-floating-panel iframe");
    await expect(panel.getByText("已连接", { exact: true })).toBeVisible();
    await worker.evaluate(async () => chrome.storage.local.remove("extensionToken"));
    await expect(panel.getByText("未登录", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "刷新登录状态" }).click();
    await expect(panel.getByText("已连接", { exact: true })).toBeVisible();
    await expect(panel.locator(".status-banner")).toContainText("还没有可用简历");
  } finally {
    await website.close();
    await worker.evaluate(async () => chrome.storage.local.clear());
  }
});

test("业务401清理旧授权和缓存，不把过期登录当作已连接", async () => {
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    const scope = globalThis as typeof globalThis & { originalResumeFetch?: typeof fetch };
    scope.originalResumeFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('{"code":401,"message":"登录失效"}', { status: 200 });
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      extensionToken: "expired-fixture-token",
      "resumeCache:list": { savedAt: Date.now(), value: [{ id: "expired", title: "过期缓存简历" }] }
    });
  });
  try {
    await page.goto("http://127.0.0.1:4173/simple.html");
    await page.getByRole("button", { name: "打开 Offer Star 简历助手" }).click();
    const panel = page.frameLocator("#offer-star-floating-panel iframe");
    await expect(panel.getByText("未登录", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "打开 Offer Star 登录" })).toBeVisible();
    await expect(panel.getByText("过期缓存简历")).toHaveCount(0);
    expect(await worker.evaluate(async () => {
      const stored = await chrome.storage.local.get(["extensionToken", "resumeCache:list"]);
      return Boolean(stored.extensionToken || stored["resumeCache:list"]);
    })).toBe(false);
  } finally {
    await worker.evaluate(async () => {
      const scope = globalThis as typeof globalThis & { originalResumeFetch?: typeof fetch };
      if (scope.originalResumeFetch) globalThis.fetch = scope.originalResumeFetch;
      delete scope.originalResumeFetch;
      await chrome.storage.local.clear();
    });
  }
});
