import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "../../scripts/browser-executable.mjs";

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.output/chrome-mv3");

for (const width of [1280, 320]) {
  test(`填写统计、顶部账号和邀请卡在 ${width}px 窗口正常工作`, async () => {
    const context = await chromium.launchPersistentContext("", {
      headless: true,
      executablePath: resolveBrowserExecutable("chromium"),
      viewport: { width, height: 900 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      await worker.evaluate(async () => {
        const originalFetch = globalThis.fetch;
        // 只使用独立测试账号和脱敏缓存，不请求生产简历服务。
        globalThis.fetch = (input, init) => {
          const url = String(input);
          if (url.includes("/auth/c/getLoginUser/offer")) return Promise.resolve(new Response(JSON.stringify({ code: 200, data: { nickname: "昵称较长的测试同学", invitationCode: "TEST123", offerMemberExpirationTime: "2099-12-31 23:59:59" } }), { headers: { "content-type": "application/json" } }));
          if (url.startsWith("https://api.gfjianli.com/api/")) return Promise.reject(new Error("脱敏简历夹具模拟离线"));
          return originalFetch(input, init);
        };
        const now = new Date();
        const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        await chrome.storage.local.set({
          extensionToken: "fixture-token",
          fillStats: { day, today: 1, total: 8 },
          "resumeCache:list": { value: [{ id: "fixture-resume", title: "脱敏测试简历" }], savedAt: Date.now() },
          "resumeCache:profile:fixture-resume": { value: { basic: { name: "测试同学" }, education: [{ school: "测试大学", degree: "本科", description: "教育说明" }], workExperience: [{ company: "测试公司", position: "实习生" }], projectExperience: [{ name: "测试项目" }], skills: ["TypeScript"], selfIntroduction: "脱敏自我介绍" }, savedAt: Date.now() }
        });
      });
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/simple.html");
      await page.getByRole("button", { name: "打开极速海投简历助手" }).click();
      const panel = page.frameLocator("#offer-star-floating-panel iframe");
      await expect(panel.locator(".panel-header .header-account")).toContainText("昵称较长的测试同学");
      await expect(panel.getByRole("link", { name: "VIP会员", exact: true })).toBeVisible();
      await expect(panel.locator(".application-stat strong").first()).toHaveText("1");
      await expect(panel.locator(".application-stat strong").last()).toHaveText("8次");
      await expect(panel.getByText(/成功填表计次|每日目标/)).toHaveCount(0);
      await expect.poll(() => panel.locator(".panel-header").evaluate((header) => header.scrollWidth <= header.clientWidth)).toBe(true);
      await expect.poll(() => panel.locator("main").evaluate((main) => main.scrollWidth <= main.clientWidth)).toBe(true);
      await expect(panel.locator(".brand-mark")).toHaveCSS("width", "28px");
      await expect(panel.locator(".header-account .account-avatar")).toHaveCSS("width", "28px");
      await expect(page.locator("#offer-star-floating-panel")).toHaveCSS("height", "580px");
      await expect(page.locator("#offer-star-floating-panel")).toHaveCSS("width", width === 320 ? "288px" : "340px");
      await expect(panel.getByRole("tab", { name: "自动填充", exact: true })).toHaveCSS("font-size", "12px");
      await expect(panel.locator(".status-banner")).toHaveCSS("font-size", "11px");
      await expect.poll(() => panel.locator(".panel-header").evaluate((header) => {
        const brand = header.querySelector(".brand-lockup")!.getBoundingClientRect();
        const account = header.querySelector(".header-account")!.getBoundingClientRect();
        const close = header.querySelector(".panel-close-button")!.getBoundingClientRect();
        return brand.right <= account.left && account.right <= close.left;
      })).toBe(true);
      await expect(panel.locator(".panel-footer")).toBeInViewport({ ratio: 1 });
      await panel.getByRole("button", { name: "自动填充此页面", exact: true }).click();
      await expect(page.locator('input[name="name"]')).toHaveValue("测试同学");
      await expect(panel.locator(".application-stat strong").first()).toHaveText("2");
      await expect(panel.locator(".application-stat strong").last()).toHaveText("9次");
      await expect(panel.locator(".status-banner")).toContainText("已填入当前页面");
      await expect(panel.getByRole("button", { name: "自动填充此页面", exact: true })).toHaveAttribute("aria-busy", "false");
      await page.screenshot({ path: test.info().outputPath(`panel-progress-${width}.png`) });
      // 完整简历包含测试表单未提供的经历控件；重复填写跳过或失败均不得增加计数。
      await panel.getByRole("button", { name: "自动填充此页面", exact: true }).click();
      await expect(panel.locator(".status-banner")).toHaveClass(/status-done/);
      await expect(panel.getByRole("button", { name: "自动填充此页面", exact: true })).toHaveAttribute("aria-busy", "false");
      await expect(panel.locator(".application-stat strong").first()).toHaveText("2");
      await panel.getByRole("button", { name: "关闭悬浮面板" }).click();
      await page.getByRole("button", { name: "打开极速海投简历助手" }).click();
      // 修改简历固定跳到用户指定的首页，不传递登录凭证。
      await context.route("https://gfjianli.com/", (route) => route.fulfill({ contentType: "text/html", body: "<title>修改简历测试页</title>" }));
      await panel.getByRole("tab", { name: "简历预览", exact: true }).click();
      const edit = panel.getByRole("link", { name: "修改简历", exact: true });
      await expect(edit).toHaveAttribute("href", "https://gfjianli.com/");
      await expect(edit).toBeVisible();
      await expect(panel.locator("details.preview-section")).toHaveCount(6);
      await expect(panel.locator("details.preview-section[open]")).toHaveCount(0);
      await expect(panel.locator(".preview-facts")).toBeHidden();
      const basicSection = panel.locator("details.preview-section").filter({ hasText: "基本信息" });
      const educationSection = panel.locator("details.preview-section").filter({ hasText: "教育经历" });
      await basicSection.locator("summary").press("Enter");
      await expect(panel.locator(".preview-facts")).toBeVisible();
      await educationSection.locator("summary").click();
      await expect(educationSection).toHaveAttribute("open", "");
      await expect(basicSection).toHaveAttribute("open", "");
      await basicSection.locator("summary").press("Space");
      await educationSection.locator("summary").click();
      await expect(panel.locator("details.preview-section[open]")).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath(`resume-edit-${width}.png`) });
      const editDestination = context.waitForEvent("page");
      await edit.click();
      const editPage = await editDestination;
      await expect(editPage).toHaveURL("https://gfjianli.com/");
      expect(await editPage.evaluate(() => window.opener === null)).toBe(true);
      await editPage.close();
      await panel.getByRole("tab", { name: "自动填充", exact: true }).click();
      await panel.getByRole("button", { name: "马上邀请" }).click();
      await expect(panel.getByRole("textbox", { name: "邀请链接" })).toHaveValue("https://offer.gfjianli.com/?invitationCode=TEST123");
      await expect(panel.getByRole("button", { name: "复制邀请链接" })).toBeVisible();
      const frame = page.frames().find((item) => item.url().includes("floating-panel.html"))!;
      // 测试复制成功和浏览器拒绝时的提示，不改写系统剪贴板。
      await frame.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("测试拒绝复制"); } } }));
      await panel.getByRole("button", { name: "复制邀请链接" }).click();
      await expect(panel.getByRole("region", { name: "分享邀请链接" })).toContainText("请选中上方链接手动复制");
      await frame.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { (window as unknown as { copiedInvite: string }).copiedInvite = value; } } }));
      await panel.getByRole("button", { name: "复制邀请链接" }).click();
      await expect(panel.getByRole("region", { name: "分享邀请链接" })).toContainText("邀请链接已复制");
      expect(await frame.evaluate(() => (window as unknown as { copiedInvite: string }).copiedInvite)).toBe("https://offer.gfjianli.com/?invitationCode=TEST123");
      await page.screenshot({ path: test.info().outputPath(`panel-invite-${width}.png`) });
      await panel.getByRole("button", { name: "关闭邀请" }).click();

      // 多个面板并发上报、空结果上报不会丢计数。
      await frame.evaluate(async () => {
        await Promise.all(Array.from({ length: 8 }, () => chrome.runtime.sendMessage({ type: "RECORD_SUCCESSFUL_FILL", filledCount: 1 })));
        await chrome.runtime.sendMessage({ type: "RECORD_SUCCESSFUL_FILL", filledCount: 0 });
      });
      await expect(panel.locator(".application-stat strong").first()).toHaveText("10");
      await expect(panel.locator(".application-stat strong").last()).toHaveText("17次");
      await page.reload();
      await page.getByRole("button", { name: "打开极速海投简历助手" }).click();
      await expect(panel.locator(".application-stat strong").last()).toHaveText("17次");

      await worker.evaluate(() => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (input, init) => String(input).includes("/auth/c/getLoginUser/offer")
          ? Promise.resolve(new Response(JSON.stringify({ code: 200, data: { nickname: "测试同学" } }), { headers: { "content-type": "application/json" } }))
          : originalFetch(input, init);
      });
      await page.reload();
      await page.getByRole("button", { name: "打开极速海投简历助手" }).click();
      await expect(panel.locator(".header-account")).toContainText("测试同学");
      await expect(panel.getByRole("link", { name: "免费版", exact: true })).toBeVisible();
      await expect(panel.getByRole("link", { name: "VIP会员", exact: true })).toHaveCount(0);
      await panel.getByRole("button", { name: "马上邀请" }).click();
      await expect(panel.getByRole("region", { name: "分享邀请链接" })).toContainText("暂未获取到邀请链接");
      await expect(panel.getByRole("textbox", { name: "邀请链接" })).toHaveCount(0);
      await worker.evaluate(() => chrome.storage.local.remove("extensionToken"));
      await expect(panel.locator(".header-account")).toHaveCount(0);
      await expect(panel.getByRole("region", { name: "分享邀请链接" })).toHaveCount(0);
      await page.setViewportSize({ width, height: 420 });
      await expect.poll(() => page.locator("#offer-star-floating-panel").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      })).toBe(true);
    } finally {
      await context.close();
    }
  });
}
