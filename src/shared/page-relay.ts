import type { ExtensionMessage, PageCommand } from "./messages";

const pageCommands = new Set<PageCommand["type"]>(["SCAN_PAGE", "FILL_FIELDS", "GET_PAGE_CONTEXT", "UNDO_FILL", "ADVANCE_FORM_STEP", "FILL_PHOTO", "FILL_FILES"]);

/** 网页内面板没有标签页接口时，只允许扩展页把已知的页面操作转交后台。 */
export function pageRelayRequest(message: ExtensionMessage, senderIsExtensionPage: boolean) {
  if (!senderIsExtensionPage || message.type !== "RELAY_PAGE_MESSAGE") return null;
  if (!Number.isInteger(message.tabId) || message.tabId <= 0 || !pageCommands.has(message.message.type)) return null;
  return { tabId: message.tabId, message: message.message };
}
