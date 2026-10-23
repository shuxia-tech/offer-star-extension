import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: path.join(tmpdir(), "offer-star-extension-e2e"),
  timeout: 15_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["Desktop Chrome"]
  },
  webServer: {
    command: "vite --host 127.0.0.1 --port 4173 --config vite.test.config.ts",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30_000
  },
  reporter: [["list"]]
});
