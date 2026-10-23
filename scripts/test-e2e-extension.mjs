import { resolveBrowserExecutable } from "./browser-executable.mjs";
import { productionBuildEnv, runCli } from "./run-cli.mjs";

try {
  const env = {
    ...productionBuildEnv(),
    CHROME_EXECUTABLE_PATH: resolveBrowserExecutable("chromium"),
    EXTENSION_E2E_HEADED: "1",
    EXTENSION_E2E_ASSERT_EXTENSION: "1"
  };
  const buildCode = runCli("wxt", ["build", "-b", "chrome"], env);
  process.exitCode = buildCode || runCli("playwright", ["test", "tests/e2e/extension.spec.ts"], env);
} catch (error) {
  console.error("扩展浏览器验收失败：", error instanceof Error ? error.message : "未知异常");
  process.exitCode = 1;
}
