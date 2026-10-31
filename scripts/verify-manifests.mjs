import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readManifest(target) {
  try {
    return JSON.parse(await readFile(resolve(root, target), "utf8"));
  } catch (error) {
    throw new Error(`无法读取构建产物 ${target}，请先执行 npm run build:all`, { cause: error });
  }
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(`构建产物契约失败：${message}`);
}

function exposesFloatingPanel(manifest) {
  const resources = manifest.web_accessible_resources;
  if (resources?.some?.((item) => item.resources?.includes("floating-panel.html") && item.resources?.includes("chunks/*"))) return true;
  return resources?.includes?.("floating-panel.html") && resources?.includes?.("chunks/*");
}

const chrome = await readManifest(".output/chrome-mv3/manifest.json");
const edge = await readManifest(".output/edge-mv3/manifest.json");
const firefox = await readManifest(".output/firefox-mv2/manifest.json");

for (const [name, manifest] of [["Chrome", chrome], ["Edge", edge]]) {
  assertCondition(manifest.manifest_version === 3, `${name} 必须使用 Manifest V3`);
  assertCondition(!manifest.side_panel, `${name} 不得声明浏览器原生 Side Panel`);
  assertCondition(!manifest.permissions?.includes("sidePanel"), `${name} 不得申请浏览器原生 sidePanel 权限`);
  assertCondition(manifest.action?.default_title === "打开极速海投简历助手", `${name} 必须声明扩展按钮标题`);
  assertCondition(manifest.content_scripts?.some((item) => item.matches?.includes("http://*/*") && item.matches?.includes("https://*/*")), `${name} 必须覆盖 HTTP 和 HTTPS 页面`);
  assertCondition(manifest.web_accessible_resources?.some((item) => item.resources?.includes("floating-panel.html") && item.resources?.includes("chunks/*")), `${name} 必须暴露网页内悬浮面板及其打包脚本`);
}

assertCondition(firefox.manifest_version === 2, "Firefox 目标必须使用 Manifest V2 兼容构建");
assertCondition(!firefox.sidebar_action, "Firefox 不得声明浏览器原生 Sidebar");
assertCondition(!firefox.side_panel, "Firefox 不得声明 Chromium Side Panel");
assertCondition(!firefox.permissions?.includes("sidePanel"), "Firefox 不得申请 Chromium sidePanel 权限");
assertCondition(firefox.browser_action?.default_title === "打开极速海投简历助手", "Firefox 必须声明扩展按钮标题");
assertCondition(firefox.browser_specific_settings?.gecko?.id === "offer-star-extension@example.com", "Firefox 必须声明稳定扩展 ID");
assertCondition(firefox.content_scripts?.some((item) => item.matches?.includes("http://*/*") && item.matches?.includes("https://*/*")), "Firefox 必须覆盖 HTTP 和 HTTPS 页面");
assertCondition(exposesFloatingPanel(firefox), "Firefox 必须暴露网页内悬浮面板及其打包脚本");

console.log("浏览器 manifest 契约通过：网页内悬浮面板资源、无原生侧边栏入口、内容脚本匹配和扩展按钮均已声明");
