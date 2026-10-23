import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sources = {
  extension: resolve(root, "src/shared/messages.ts"),
  web: resolve(process.env.OFFER_STAR_WEB_CONTRACT_PATH || resolve(root, "../offer-star-web/lib/extension-ai.ts")),
  node: resolve(process.env.OFFER_STAR_NODE_CONTRACT_PATH || [
    resolve(root, "../resume-node/src/modules/extension/extension-ai-routes.ts"),
    resolve(root, "../ai-resume-node/src/modules/extension/extension-ai-routes.ts")
  ].find((path) => existsSync(path)) || resolve(root, "../resume-node/src/modules/extension/extension-ai-routes.ts"))
};

const missing = Object.entries(sources).filter(([, path]) => !existsSync(path));
if (missing.length) {
  console.error("[Offer Star][Contract] 字段契约检查未通过，缺少关联项目文件：", Object.fromEntries(missing));
  console.error("请恢复包含扩展 AI 接口的关联仓库版本，或通过 OFFER_STAR_WEB_CONTRACT_PATH、OFFER_STAR_NODE_CONTRACT_PATH 指定真实契约文件；不能用插件字段副本代替服务端契约。");
  process.exit(1);
}

function extract(sourceName, pattern) {
  const source = readFileSync(sources[sourceName], "utf8");
  const block = source.match(pattern)?.[1];
  if (!block) throw new Error(`无法读取 ${sourceName} 的字段契约`);
  return [...block.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

const fields = {
  extension: extract("extension", /export type FieldKey\s*=([\s\S]*?);/),
  web: extract("web", /extensionFieldKeySchema\s*=\s*z\.enum\(\[([\s\S]*?)\]\);/),
  node: extract("node", /const fieldKey\s*=\s*z\.enum\(\[([\s\S]*?)\]\);/)
};

const expected = fields.extension.join("\u0000");
const mismatches = Object.entries(fields)
  .filter(([name, values]) => name !== "extension" && values.join("\u0000") !== expected)
  .map(([name]) => name);

if (mismatches.length) {
  console.error("[Offer Star][Contract] 插件、Web 和 Node 的字段契约不一致", { 不一致项目: mismatches, 字段: fields });
  process.exitCode = 1;
} else {
  console.info("[Offer Star][Contract] 插件、Web 和 Node 字段契约一致", { 字段数量: fields.extension.length });
}
