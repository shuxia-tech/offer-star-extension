import { withRequestTimeout } from "./request-timeout";

export class ResumeSessionExpiredError extends Error {
  constructor() {
    super("登录已失效，请重新登录极速海投");
    this.name = "ResumeSessionExpiredError";
  }
}

/** 超时覆盖响应头和响应体；不把服务端原始错误或用户数据带入日志。 */
export async function requestResumeApi(url: string, token: string, options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<unknown> {
  const controller = new AbortController();
  const operation = (async () => {
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)(url, { headers: { token }, signal: controller.signal });
    } catch {
      throw new Error("无法连接简历服务，请检查网络后刷新登录状态");
    }
    if (response.status === 401) throw new ResumeSessionExpiredError();
    if (!response.ok) throw new Error(`简历服务暂不可用（${response.status}），请稍后刷新登录状态`);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error("简历服务响应格式异常，请稍后刷新登录状态");
    }
    if (!body || typeof body !== "object") throw new Error("简历服务响应格式异常，请稍后刷新登录状态");
    const result = body as { code?: unknown; data?: unknown };
    const code = result.code === undefined ? undefined : Number(result.code);
    if (code === 401) throw new ResumeSessionExpiredError();
    if (code !== undefined && code !== 0 && code !== 200) throw new Error("简历服务返回业务错误，请稍后刷新登录状态");
    return result.data ?? body;
  })();
  return withRequestTimeout(operation, options.timeoutMs ?? 12_000,
    "简历服务响应超时，请检查网络后刷新登录状态", () => controller.abort());
}
