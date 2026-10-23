import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const webRoot = resolve("../offer-star-web");
const roots = [resolve("."), ...(existsSync(webRoot) ? [webRoot] : [])];
const ignoredDirectories = new Set([".git", "node_modules", ".output", "dist", "test-results", ".next", "target"]);
const ignoredFiles = new Set(["package-lock.json"]);
const secretPattern = /sk-[A-Za-z0-9]{20,}/g;
const findings = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await scan(join(directory, entry.name));
      continue;
    }
    if (ignoredFiles.has(entry.name)) continue;
    const path = join(directory, entry.name);
    const content = await readFile(path, "utf8").catch(() => "");
    if (secretPattern.test(content)) findings.push(path);
    secretPattern.lastIndex = 0;
  }
}

for (const root of roots) await scan(root);
if (findings.length) {
  console.error("发现疑似硬编码 API Key：", findings);
  process.exit(1);
}
console.log(`密钥扫描通过：${roots.length === 2 ? "扩展和 Web" : "扩展"}源码未发现匹配规则的硬编码 API Key`);
if (roots.length === 1) console.warn("未找到同级 offer-star-web，网站源码未纳入本次密钥扫描；跨项目契约仍由 test:contracts 严格检查。");
