import { describe, expect, it, vi } from "vitest";
import { isOfferStarAuthStorageKey, readOfferStarPageToken, readOfferStarToken, readOfferStarTokenInPage, tokenFromLoginCallback, tokenFromStorageEvent } from "../src/shared/token-sync";

describe("官网登录状态同步", () => {
  it("只提取 SECRET_TOKEN 且去除首尾空格", () => {
    expect(tokenFromStorageEvent({ key: "SECRET_TOKEN", newValue: "  token-1  " } as StorageEvent)).toBe("token-1");
    expect(tokenFromStorageEvent({ key: "OTHER_TOKEN", newValue: "token-2" } as StorageEvent)).toBeNull();
    expect(tokenFromStorageEvent({ key: "SECRET_TOKEN", newValue: "   " } as StorageEvent)).toBeNull();
  });

  it("同一页面轮询时读取当前 SECRET_TOKEN，并把空值视为退出登录", () => {
    const storage = { getItem: (key: string) => key === "SECRET_TOKEN" ? "  token-3  " : null } as Storage;
    expect(readOfferStarToken(storage)).toBe("token-3");
    expect(readOfferStarToken({ getItem: () => "   " })).toBeNull();
  });

  it("读取线上官网的 Zustand 授权，而非其他用户资料", () => {
    const storage = { getItem: (key: string) => key === "userStore" ? '{"state":{"token":" fixture-token ","userInfo":{"name":"测试"}}}' : null } as Storage;
    expect(readOfferStarToken(storage)).toBe("fixture-token");
    expect(tokenFromStorageEvent({ key: "userStore", newValue: storage.getItem("userStore") } as StorageEvent)).toBe("fixture-token");
  });

  it("当前官网退出后不回退旧 SECRET_TOKEN", () => {
    const storage = { getItem: (key: string) => key === "userStore" ? '{"state":{"token":null}}' : "old-token" } as Storage;
    expect(readOfferStarToken(storage)).toBeNull();
  });

  it("损坏、无授权字段的状态兼容旧版，不接受非字符串凭证", () => {
    for (const state of ["invalid", '{"state":{}}']) {
      expect(readOfferStarToken({ getItem: (key: string) => key === "userStore" ? state : "legacy" } as Storage)).toBe("legacy");
    }
    expect(tokenFromStorageEvent({ key: "userStore", newValue: "invalid" } as StorageEvent)).toBeNull();
    expect(readOfferStarToken({ getItem: () => '{"state":{"token":123}}' })).toBeNull();
    expect(isOfferStarAuthStorageKey("userStore")).toBe(true);
    expect(isOfferStarAuthStorageKey(null)).toBe(true);
    expect(isOfferStarAuthStorageKey("OTHER_TOKEN")).toBe(false);
  });

  it("登录回调地址上的凭证优先于尚未写完的本地存储", () => {
    const storage = { getItem: () => null } as Storage;
    expect(tokenFromLoginCallback("?token=%20fresh-token%20")).toBe("fresh-token");
    expect(readOfferStarPageToken("?token=fresh-token", storage)).toBe("fresh-token");
    expect(readOfferStarPageToken("?token=", { getItem: () => '{"state":{"token":"stored"}}' } as Storage)).toBe("stored");
    expect(readOfferStarPageToken("", { getItem: () => '{"state":{"token":"stored"}}' } as Storage)).toBe("stored");
  });

  it("序列化注入入口与内容脚本读取结果一致，并拒绝其他来源", () => {
    const injected = new Function(`return (${readOfferStarTokenInPage.toString()})()`);
    try {
      vi.stubGlobal("location", { origin: "https://offer.gfjianli.com" });
      for (const raw of ['{"state":{"token":" current "}}', '{"state":{"token":null}}', "invalid"]) {
        const storage = { getItem: (key: string) => key === "userStore" ? raw : "legacy" } as Storage;
        vi.stubGlobal("localStorage", storage);
        expect(injected()).toBe(readOfferStarToken(storage));
      }
      vi.stubGlobal("location", { origin: "https://evil.test" });
      expect(injected).toThrow("目标页面已变化");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
