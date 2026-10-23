import { afterEach, describe, expect, it, vi } from "vitest";
import { requestResumeApi, ResumeSessionExpiredError } from "../src/shared/resume-request";
import { withRequestTimeout } from "../src/shared/request-timeout";

afterEach(() => vi.useRealTimers());

describe("简历服务登录检查", () => {
  it("成功返回简历数据", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"code":200,"data":{"list":[]}}'));
    await expect(requestResumeApi("https://example.test", "test-token", { fetchImpl })).resolves.toEqual({ list: [] });
  });

  it.each([401, "401"])("HTTP 200 内业务码 %s 视为登录失效", async (code) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code, message: "不应输出的服务端原文" })));
    await expect(requestResumeApi("https://example.test", "test-token", { fetchImpl })).rejects.toBeInstanceOf(ResumeSessionExpiredError);
  });

  it("HTTP 401 同样要求重新登录", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    await expect(requestResumeApi("https://example.test", "test-token", { fetchImpl })).rejects.toThrow("登录已失效");
  });

  it.each(["网络", "JSON", "业务"])("%s 错误提供固定提示而非服务端原文", async (kind) => {
    const fetchImpl = kind === "网络" ? vi.fn().mockRejectedValue(new Error("private-token"))
      : vi.fn().mockResolvedValue(new Response(kind === "JSON" ? "private-token" : '{"code":500,"message":"private-token"}'));
    await expect(requestResumeApi("https://example.test", "test-token", { fetchImpl })).rejects.not.toThrow("private-token");
  });

  it.each(["响应头", "响应体"])("%s 永不返回也能超时并取消请求", async (phase) => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => {});
    const fetchImpl = vi.fn().mockImplementation(() => phase === "响应头" ? pending : Promise.resolve({ ok: true, status: 200, json: () => pending }));
    const result = requestResumeApi("https://example.test", "test-token", { fetchImpl, timeoutMs: 100 });
    const assertion = expect(result).rejects.toThrow("简历服务响应超时");
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("后台消息不回应时等待有上限，成功后清除计时器", async () => {
    vi.useFakeTimers();
    await expect(withRequestTimeout(Promise.resolve("完成"), 100, "超时")).resolves.toBe("完成");
    expect(vi.getTimerCount()).toBe(0);
    const assertion = expect(withRequestTimeout(new Promise(() => {}), 100, "后台登录检查超时")).rejects.toThrow("后台登录检查超时");
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
