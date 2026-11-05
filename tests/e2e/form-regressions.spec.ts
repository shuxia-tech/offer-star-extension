import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "../../scripts/browser-executable.mjs";
import type { PageCommand } from "../../src/shared/messages";
const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.output/chrome-mv3");

test("五项表单回归：区号、照片、iframe、经历计数和隐藏候选项", async () => {
  const context = await chromium.launchPersistentContext("", {
    headless: true, executablePath: resolveBrowserExecutable("chromium"),
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.route("**/form-regressions.html", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><meta charset="utf-8"><title>脱敏回归测试</title>
      <div><label>手机号</label><select id="country"><option>+86</option><option>+1</option></select><input id="phone" placeholder="请输入手机号"></div>
      <div role="option" hidden>运营经理</div><input id="photo" type="file" accept="image/*">
      <label>应聘职位<input id="position" role="combobox" aria-haspopup="listbox"></label><div role="option" data-value="产品经理" hidden>产品经理</div>
      <label>期望城市<input id="city" role="combobox" aria-label="期望城市" aria-haspopup="listbox"></label><div id="cities"></div>
      <section id="work"><label>公司<input name="company-1"></label><button type="button" id="add-work">新增工作经历</button></section>
      <iframe id="child" srcdoc="<title>申请表</title><label>邮箱<input name='email'></label><label>姓名<input name='name'></label>"></iframe>` }));
    await page.goto("http://127.0.0.1:4173/form-regressions.html");
    await expect(page.locator("#offer-star-floating-launcher")).toBeVisible();
    await expect(page.frameLocator("#child").locator('[name="email"]')).toBeVisible();
    await page.evaluate(() => {
      document.getElementById("add-work")!.addEventListener("click", () => {
        const label = document.createElement("label"); label.textContent = "公司";
        const input = document.createElement("input"); input.name = `company-${document.querySelectorAll("#work input").length + 1}`;
        label.append(input); document.getElementById("add-work")!.before(label);
      });
      document.getElementById("city")!.addEventListener("input", () => {
        const list = document.createElement("div"); list.setAttribute("role", "listbox");
        const option = document.createElement("div"); option.setAttribute("role", "option"); option.textContent = "上海";
        option.addEventListener("click", () => { (document.getElementById("city") as HTMLInputElement).value = "上海"; });
        list.append(option); document.getElementById("cities")!.replaceChildren(list);
      });
    });
    // 扩展内部消息操作独立脱敏页面，不读取生产简历或账号。
    const send = (message: PageCommand) => worker.evaluate(async (msg) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return chrome.tabs.sendMessage(tab.id!, msg);
    }, message);
    const scan = await send({ type: "SCAN_PAGE" });
    expect(scan.fields.filter((field: { key: string }) => field.key === "phone")).toHaveLength(1);
    expect(scan.fields.map((field: { key: string }) => field.key)).toEqual(expect.arrayContaining(["photo", "email", "name"]));
    const values = { phone: "13800000000", email: "fixture@example.com", name: "测试用户", targetCity: "上海", company: ["甲公司", "乙公司"] };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await send({ type: "FILL_FIELDS", values, mode: "overwrite" });
      expect(result.failed).toEqual([]);
      await expect(page.locator("#work input")).toHaveCount(2);
      expect(await page.locator("#work input").evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value))).toEqual(["甲公司", "乙公司"]);
    }
    await expect(page.locator("#country")).toHaveValue("+86"); await expect(page.locator("#phone")).toHaveValue(values.phone);
    await expect(page.frameLocator("#child").locator('[name="email"]')).toHaveValue(values.email);
    await expect(page.frameLocator("#child").locator('[name="name"]')).toHaveValue(values.name);
    const failed = await send({ type: "FILL_FIELDS", values: { targetPosition: "产品经理" }, mode: "overwrite" });
    expect(failed.failed).toEqual(["targetPosition"]); expect(failed.filled).toEqual([]);
    await expect(page.locator("#position")).toHaveValue("");
    await expect(page.locator("#photo")).toHaveValue("");
  } finally { await context.close(); }
});
