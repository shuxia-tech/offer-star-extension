import { describe, expect, it } from "vitest";
import { pageRelayRequest } from "../src/shared/page-relay";

describe("网页面板消息转发", () => {
  it("只转发扩展页发出的页面操作", () => {
    expect(pageRelayRequest({ type: "RELAY_PAGE_MESSAGE", tabId: 3, message: { type: "SCAN_PAGE" } }, true)).toEqual({
      tabId: 3,
      message: { type: "SCAN_PAGE" }
    });
    expect(pageRelayRequest({ type: "RELAY_PAGE_MESSAGE", tabId: 3, message: { type: "SCAN_PAGE" } }, false)).toBeNull();
    expect(pageRelayRequest({ type: "RELAY_PAGE_MESSAGE", tabId: 0, message: { type: "SCAN_PAGE" } }, true)).toBeNull();
    expect(pageRelayRequest({ type: "GET_RESUME_LIST" }, true)).toBeNull();
  });
});
