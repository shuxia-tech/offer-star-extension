import { describe, expect, it } from "vitest";
import { getMembershipStatus, normalizeMembershipExpiration } from "../src/shared/membership";

const now = new Date(2026, 9, 31, 12).getTime();

describe("官网会员状态", () => {
  it("空到期时间或已过期时显示免费版", () => {
    expect(getMembershipStatus(normalizeMembershipExpiration(null), now)).toBe("free");
    expect(getMembershipStatus(now - 1, now)).toBe("free");
    expect(getMembershipStatus(now, now)).toBe("free");
  });

  it("未获取和格式错误不能冒充会员", () => {
    expect(getMembershipStatus(undefined, now)).toBe("unknown");
    for (const value of ["错误日期", "2026-02-30", "2026-13-01", "2026-10-31 25:00:00", Infinity, 1e100]) {
      expect(normalizeMembershipExpiration(value)).toBeUndefined();
    }
  });

  it("未到期显示 VIP，超过官网永久会员边界时显示永久会员", () => {
    expect(getMembershipStatus(now + 1, now)).toBe("vip");
    expect(getMembershipStatus(new Date(2100, 0, 1).getTime(), now)).toBe("vip");
    expect(getMembershipStatus(new Date(2100, 0, 1).getTime() + 1, now)).toBe("lifetime");
  });

  it("兼容官网本地日期时间、带时区时间和毫秒时间戳", () => {
    expect(normalizeMembershipExpiration("2026-11-01 10:30:00")).toBe(new Date(2026, 10, 1, 10, 30).getTime());
    expect(normalizeMembershipExpiration("2026-11-01")).toBe(new Date(2026, 10, 1).getTime());
    expect(normalizeMembershipExpiration("2026-11-01T10:30:00+08:00")).toBe(Date.parse("2026-11-01T02:30:00Z"));
    expect(normalizeMembershipExpiration(now)).toBe(now);
  });
});
