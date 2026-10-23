/** 使用 web-ext 为临时实例分配的端口，避免重复传入 Firefox 启动参数。 */
export function readFirefoxDebugPort(output) {
  const match = output.match(/Firefox args:[^\r\n]*?-start-debugger-server\s+(\d+)/);
  const port = Number(match?.[1]);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}
