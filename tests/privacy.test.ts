/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { buildAiRequestBody, sanitizePageUrl, sanitizeText } from "../src/shared/privacy";
import { createDomEngine } from "../src/content/dom-engine";
import { installNavigationObserver } from "../src/shared/navigation-observer";

describe("页面地址和 AI 出站脱敏", () => {
  it("删除凭证、查询参数和片段，同时保留端口与站点路径", () => {
    expect(sanitizePageUrl("https://user:secret@site.example:8443/apply/1?token=secret#phone=13812345678"))
      .toBe("https://site.example:8443/apply/1");
  });

  it.each(["invalid?token=secret", "javascript:alert(1)", "file:///private/resume", "", undefined])("无效或受限制地址不回传原文：%s", (url) => {
    expect(sanitizePageUrl(url)).toBe("");
  });

  it("路径中的明文或编码联系方式也会脱敏", () => {
    const url = sanitizePageUrl("https://site.example/user/hr%40example.com/13812345678/110101199001011234");
    const decoded = decodeURIComponent(url);
    expect(decoded).not.toMatch(/hr@example.com|13812345678|110101199001011234/);
    expect(sanitizePageUrl(url)).toBe(url);
  });

  it("清除常见敏感文本但保留技术描述", () => {
    expect(sanitizeText("TypeScript hr@example.com +86 13812345678 11010119900101123X"))
      .toBe("TypeScript [邮箱已脱敏] [手机号已脱敏] [身份证号已脱敏]");
  });

  it("实际请求体不含完整地址、可编辑文本中的个人信息或额外简历字段", () => {
    const message = {
      type: "ANALYZE_PAGE_WITH_AI" as const,
      pageUrl: "https://site.example/apply?token=private#private",
      siteId: "generic",
      jobDescription: "联系 hr@example.com",
      fields: [{ id: "offer-star-field-0", key: null, label: "电话 13812345678", type: "input", elementIndex: 0, confidence: 0.5 }],
      resume: { skills: ["TypeScript", "hr@example.com"], selfIntroduction: "身份证 110101199001011234", basic: { name: "不应发送的姓名" } },
      draftInstruction: "联系 13812345678"
    };
    const body = buildAiRequestBody(message);
    expect(JSON.stringify(body)).not.toMatch(/private|hr@example.com|13812345678|110101199001011234|不应发送的姓名/);
    expect(body.fields[0].id).toBe("offer-star-field-0");
    expect(body.resume?.skills[0]).toBe("TypeScript");
    expect(message.fields[0].label).toContain("13812345678");
    expect(() => buildAiRequestBody({ ...message, pageUrl: "invalid" })).toThrow("当前页面地址无效");
  });

  it("扫描日志只输出脱敏地址", () => {
    document.body.innerHTML = '<input name="name">';
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      createDomEngine(document, "https://site.example/apply?phone=13812345678#private").scan();
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/13812345678|private/);
      expect(JSON.stringify(log.mock.calls)).toContain("https://site.example/apply");
    } finally {
      log.mockRestore();
    }
  });

  it("仅查询参数变化仍触发页面失效，不用脱敏地址代替内部版本判断", () => {
    window.history.replaceState({}, "", "/apply?step=1");
    const changes: string[] = [];
    const cleanup = installNavigationObserver(window, ({ url }) => changes.push(url));
    try {
      window.history.pushState({}, "", "/apply?step=2");
      expect(changes).toHaveLength(1);
      expect(changes[0]).toContain("?step=2");
    } finally {
      cleanup();
    }
  });
});
