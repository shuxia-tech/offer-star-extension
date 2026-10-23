import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const entrypoints = {
  wxt: "../node_modules/wxt/bin/wxt.mjs",
  playwright: "../node_modules/@playwright/test/cli.js"
};

export function productionBuildEnv(env = process.env) {
  const result = { ...env };
  delete result.OFFER_STAR_E2E_AI;
  delete result.VITE_OFFER_STAR_AI_URL;
  return result;
}

/** 直接启动本地 Node 入口，避免各系统 shell 的环境变量语法和路径引号差异。 */
export function runCli(tool, args, env = process.env) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(entrypoints[tool], import.meta.url)), ...args], {
    stdio: "inherit",
    shell: false,
    env
  });
  if (result.error) console.error("验收子进程启动失败：", result.error.message);
  return result.status ?? 1;
}
