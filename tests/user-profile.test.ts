import { describe, expect, it } from "vitest";
import { normalizeUserProfile } from "../src/shared/user-profile";

describe("插件用户资料", () => {
  it("只提取昵称和安全头像地址", () => {
    expect(normalizeUserProfile({
      nickname: "  星星同学  ",
      avatar: "https://cdn.example.com/avatar.png",
      phone: "13800000000"
    })).toEqual({
      nickname: "星星同学",
      avatar: "https://cdn.example.com/avatar.png"
    });
  });

  it("昵称缺失时按姓名、账号和默认名称回退", () => {
    expect(normalizeUserProfile({ name: "小王" }).nickname).toBe("小王");
    expect(normalizeUserProfile({ account: "offer-user" }).nickname).toBe("offer-user");
    expect(normalizeUserProfile(null).nickname).toBe("Offer Star 用户");
  });

  it("兼容图片 base64，拒绝脚本协议", () => {
    const raw = "a".repeat(160);
    expect(normalizeUserProfile({ avatar: raw }).avatar).toBe(`data:image/png;base64,${raw}`);
    expect(normalizeUserProfile({ avatar: "javascript:alert(1)" }).avatar).toBeUndefined();
  });
});
