import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const extension = readFileSync(path.join(root, "src/shared/messages.ts"), "utf8");
const keys = [...extension.match(/export type FieldKey\s*=([\s\S]*?);/)[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);

function withContracts(test) {
  const directory = mkdtempSync(path.join(tmpdir(), "offer-star-contract-"));
  const web = path.join(directory, "web.ts");
  const node = path.join(directory, "node.ts");
  // 这里只测试脚本解析和失败行为，临时样本不作为真实服务端验收证据。
  writeFileSync(web, `const extensionFieldKeySchema = z.enum(${JSON.stringify(keys)});`);
  writeFileSync(node, `const fieldKey = z.enum(${JSON.stringify(keys)});`);
  const run = (overrides = {}) => spawnSync(process.execPath, ["scripts/verify-field-contract.mjs"], {
    cwd: root,
    env: { ...process.env, OFFER_STAR_WEB_CONTRACT_PATH: web, OFFER_STAR_NODE_CONTRACT_PATH: node, ...overrides },
    encoding: "utf8"
  });
  try { test({ web, node, run }); } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe("跨项目契约验收脚本", () => {
  it("支持显式配置路径并解析相等的字段集合", () => withContracts(({ run }) => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("字段契约一致");
  }));

  it("缺失关联文件时严格失败并给出恢复建议", () => withContracts(({ web, run }) => {
    const result = run({ OFFER_STAR_WEB_CONTRACT_PATH: `${web}.missing` });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("缺少关联项目文件");
    expect(result.stderr).toContain("不能用插件字段副本代替服务端契约");
  }));

  it("字段不一致时不允许通过", () => withContracts(({ node, run }) => {
    writeFileSync(node, 'const fieldKey = z.enum(["name"]);');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("字段契约不一致");
  }));
});
