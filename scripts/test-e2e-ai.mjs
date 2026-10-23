import { resolveBrowserExecutable } from "./browser-executable.mjs";
import { productionBuildEnv, runCli } from "./run-cli.mjs";

const e2eEnv = { ...process.env, OFFER_STAR_E2E_AI: "1", VITE_OFFER_STAR_AI_URL: "http://127.0.0.1:4173/api/mock-ai" };
let exitCode = 1;
try {
  const executablePath = resolveBrowserExecutable("chromium");
  const buildCode = runCli("wxt", ["build", "-b", "chrome"], e2eEnv);
  exitCode = buildCode || runCli("playwright", ["test", "tests/e2e/ai-extension.spec.ts"], {
    ...e2eEnv,
    CHROME_EXECUTABLE_PATH: executablePath,
    EXTENSION_E2E_HEADED: "1",
    EXTENSION_E2E_ASSERT_EXTENSION: "1"
  });
} catch (error) {
  console.error("AI 浏览器验收失败：", error instanceof Error ? error.message : "未知异常");
} finally {
  // 测试产物可能包含 localhost AI 地址，结束时必须恢复默认生产构建。
  const restoreCode = runCli("wxt", ["build", "-b", "chrome"], productionBuildEnv());
  if (exitCode === 0 && restoreCode !== 0) exitCode = restoreCode;
}
process.exit(exitCode);
