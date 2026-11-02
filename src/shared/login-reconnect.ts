export function isOfferStarPage(url: string | undefined) {
  try {
    return Boolean(url && new URL(url).origin === "https://offer.gfjianli.com");
  } catch {
    return false;
  }
}

type WebsiteTab = { id?: number; url?: string; active?: boolean; lastAccessed?: number };

/** 显式刷新时重新读取可信官网，不依赖内容脚本是否曾经同步过相同凭证。 */
export async function reconnectOfferStarLogin(dependencies: {
  tabs: WebsiteTab[];
  readToken: (tabId: number) => Promise<string | null>;
  saveToken: (token: string) => Promise<void>;
}) {
  const tabs = dependencies.tabs
    .filter((tab) => tab.id !== undefined && isOfferStarPage(tab.url))
    .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  if (!tabs.length) throw new Error("未找到同一浏览器中的极速海投官网，请先打开官网并登录");
  let readFailed = false;
  for (const tab of tabs) {
    let token: string | null;
    try {
      token = await dependencies.readToken(tab.id!);
    } catch {
      readFailed = true;
      continue;
    }
    if (!token?.trim()) continue;
    await dependencies.saveToken(token.trim());
    return { success: true };
  }
  if (readFailed) throw new Error("无法读取官网登录状态，请允许插件访问 offer.gfjianli.com 并刷新官网后重试");
  throw new Error("官网尚未提供登录凭证，请确认在 https://offer.gfjianli.com 完成登录后重试");
}
