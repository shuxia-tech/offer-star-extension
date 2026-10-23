import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "./browser-executable.mjs";
import { readFirefoxDebugPort } from "./firefox-debug-port.mjs";

const viteEntrypoint = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const webExtEntrypoint = fileURLToPath(new URL("../node_modules/web-ext/bin/web-ext.js", import.meta.url));
const pagePort = Number(process.env.FIREFOX_FIXTURE_PAGE_PORT || 4173);
const pageUrl = `http://127.0.0.1:${pagePort}/simple.html`;
const selectorList = process.env.FIREFOX_FIXTURE_SELECTORS || "input[name=\"name\"],input[name=\"phone\"],input[name=\"email\"]";
const children = [];

function start(executable, args, label) {
  const child = spawn(executable, args, {
    cwd: process.cwd(),
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  children.push({ child, label, getOutput: () => output });
  return child;
}

function waitFor(check, timeoutMs, message) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        if (await check()) return resolve();
      } catch {
        // 进程刚启动时端口尚未就绪，继续轮询。
      }
      if (Date.now() - started >= timeoutMs) return reject(new Error(message));
      setTimeout(poll, 250);
    };
    poll();
  });
}

function httpReady() {
  return new Promise((resolve) => {
    const request = http.get(pageUrl, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => { request.destroy(); resolve(false); });
  });
}

function tcpReady(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

function stopProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  }
}

async function main() {
  const firefoxBinary = resolveBrowserExecutable("firefox");
  start(process.execPath, [viteEntrypoint, "--host", "127.0.0.1", "--port", String(pagePort), "--strictPort", "--config", "vite.test.config.ts"], "Vite 测试页");
  await waitFor(httpReady, 15000, "Vite 测试页启动超时");

  const firefox = start(process.execPath, [
    webExtEntrypoint, "run", "--source-dir", ".output/firefox-mv2", "--firefox-binary", firefoxBinary,
    "--start-url", pageUrl, "--no-input", "--no-reload", "--verbose"
  ], "Firefox 临时运行时");
  const runtime = children.find((item) => item.child === firefox);
  let debugPort;
  await waitFor(async () => {
    const output = runtime.getOutput();
    debugPort = readFirefoxDebugPort(output);
    return debugPort && /Installed .* as a temporary add-on/i.test(output) && await tcpReady(debugPort);
  }, 30000, "Firefox 调试端口或临时扩展安装超时");

  const smoke = spawn(process.execPath, ["scripts/firefox-page-smoke.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, FIREFOX_DEBUG_PORT: String(debugPort), FIREFOX_SMOKE_HOST: "127.0.0.1", FIREFOX_SMOKE_SELECTORS: selectorList },
    stdio: "inherit",
    windowsHide: true
  });
  const code = await new Promise((resolve) => smoke.once("close", resolve));
  if (code !== 0) throw new Error("Firefox 临时页面冒烟失败");
  console.log("Firefox 独立夹具冒烟通过：扩展构建、临时浏览器、测试页面和只读 DOM 检查均已完成");
}

try {
  await main();
} catch (error) {
  console.error("Firefox 独立夹具冒烟失败：", error instanceof Error ? error.message : String(error));
  for (const item of children) console.error(`${item.label} 最近日志：`, item.getOutput().slice(-2500));
  process.exitCode = 1;
} finally {
  for (const item of children) stopProcessTree(item.child);
}
