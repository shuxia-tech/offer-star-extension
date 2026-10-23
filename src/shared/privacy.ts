import type { ExtensionMessage } from "./messages";

/** 页面文本交给日志或 AI 前清除常见联系方式和身份证号，不改动本地填写值。 */
export function sanitizeText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[邮箱已脱敏]")
    .replace(/\b\d{17}[\dXx]\b/g, "[身份证号已脱敏]")
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, "[手机号已脱敏]")
    .replace(/\s+/g, " ")
    .trim();
}

/** 只输出普通网页地址，去除凭证、查询参数和片段；无效地址不回传原文。 */
export function sanitizePageUrl(rawUrl: string | null | undefined): string {
  try {
    if (!rawUrl) return "";
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.split("/").map((segment) => {
      let decoded = segment;
      try { decoded = decodeURIComponent(segment); } catch { /* 保留无法解码的路径段供后续脱敏。 */ }
      const sanitized = sanitizeText(decoded);
      return sanitized === decoded ? segment : encodeURIComponent(sanitized);
    }).join("/");
    return url.toString();
  } catch {
    return "";
  }
}

type AiMessage = Extract<ExtensionMessage, { type: "ANALYZE_PAGE_WITH_AI" }>;

/** 在实际出站边界再次脱敏，防止可编辑文本或其他消息入口绕过面板处理。 */
export function buildAiRequestBody(message: AiMessage) {
  const pageUrl = sanitizePageUrl(message.pageUrl);
  if (!pageUrl) throw new Error("当前页面地址无效，请打开普通网页后重新扫描");
  return {
    pageUrl,
    siteId: message.siteId,
    jobDescription: sanitizeText(message.jobDescription).slice(0, 12_000),
    fields: message.fields.map((field) => ({
      id: field.id,
      key: field.key,
      label: sanitizeText(field.label).slice(0, 300),
      type: field.type,
      confidence: field.confidence
    })),
    resume: message.resume ? {
      skills: message.resume.skills.map((skill) => sanitizeText(skill).slice(0, 500)),
      selfIntroduction: message.resume.selfIntroduction === undefined
        ? undefined
        : sanitizeText(message.resume.selfIntroduction).slice(0, 5_000)
    } : undefined,
    draftInstruction: sanitizeText(message.draftInstruction).slice(0, 1_000)
  };
}
