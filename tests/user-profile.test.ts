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
      avatar: "https://cdn.example.com/avatar.png",
      membershipExpiresAt: null
    });
  });

  it("昵称缺失时按姓名、账号和默认名称回退", () => {
    expect(normalizeUserProfile({ name: "小王" }).nickname).toBe("小王");
    expect(normalizeUserProfile({ account: "offer-user" }).nickname).toBe("offer-user");
    expect(normalizeUserProfile(null).nickname).toBe("极速海投用户");
  });

  it("兼容图片 base64，拒绝脚本协议", () => {
    const raw = "a".repeat(160);
    expect(normalizeUserProfile({ avatar: raw }).avatar).toBe(`data:image/png;base64,${raw}`);
    expect(normalizeUserProfile({ avatar: "javascript:alert(1)" }).avatar).toBeUndefined();
  });

  it("只传递有效的邀请代码，剔除凭证和其他资料", () => {
    expect(normalizeUserProfile({ nickname: "测试同学", invitationCode: " ABC123 ", token: "不要传递" })).toEqual({ nickname: "测试同学", invitationCode: "ABC123", membershipExpiresAt: null });
    expect(normalizeUserProfile({ invitationCode: "a".repeat(129) }).invitationCode).toBeUndefined();
  });

  it("会员使用官网专属到期字段，不用其他产品的 VIP 标志代替", () => {
    expect(normalizeUserProfile({ isMember: true, memberExpirationTime: "2099-12-31", offerMemberExpirationTime: null }).membershipExpiresAt).toBeNull();
    expect(normalizeUserProfile({ offerMemberExpirationTime: "2099-12-31 23:59:59" }).membershipExpiresAt).toBe(new Date(2099, 11, 31, 23, 59, 59).getTime());
    expect(normalizeUserProfile({ offerMemberExpirationTime: "无效日期" }).membershipExpiresAt).toBeUndefined();
  });
});
