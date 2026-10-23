import { getSiteAdapter } from "./site-adapters";
import { sanitizePageUrl, sanitizeText } from "./privacy";

export type PageContext = {
  siteId: string;
  siteName: string;
  pageUrl: string;
  pageTitle: string;
  jobDescription: string;
};

/** 提取职位页面公开文本，并在交给 AI 前去除常见联系方式。 */
export function extractPageContext(document: Document, pageUrl: string): PageContext {
  const adapter = getSiteAdapter(pageUrl);
  const adapterTitle = adapter.titleSelectors?.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector))).find((node) => node.textContent?.trim())?.textContent;
  const title = adapterTitle
    || document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content
    || document.querySelector("h1")?.textContent
    || document.title;
  const genericSelectors = "[class*='job-description'], [class*='job_detail'], [class*='description'], [class*='responsib'], [class*='requirement'], [data-testid*='description'], article, main";
  const descriptionSelectors = [...(adapter.descriptionSelectors ?? []), genericSelectors].join(",");
  const descriptionNodes = Array.from(document.querySelectorAll<HTMLElement>(descriptionSelectors));
  const text = descriptionNodes.map((node) => node.innerText || node.textContent || "").join("\n");
  return {
    siteId: adapter.id,
    siteName: adapter.name,
    pageUrl: sanitizePageUrl(pageUrl),
    pageTitle: sanitizeText(title).slice(0, 300),
    jobDescription: sanitizeText(text).slice(0, 8000)
  };
}
