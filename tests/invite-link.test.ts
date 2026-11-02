import { describe, expect, it } from "vitest";
import { buildInviteLink } from "../src/shared/invite-link";

describe("个人邀请链接", () => {
  it("固定为官网域名并对邀请码编码，不接受额外链接参数", () => {
    const url = new URL(buildInviteLink("  ABC+/&token=evil  ")!);
    expect(url.origin).toBe("https://offer.gfjianli.com");
    expect(url.searchParams.get("invitationCode")).toBe("ABC+/&token=evil");
    expect([...url.searchParams.keys()]).toEqual(["invitationCode"]);
  });

  it.each([undefined, null, 123, "", "   ", "a".repeat(129)])("没有有效邀请码 %s 时不生成假链接", (code) => {
    expect(buildInviteLink(code)).toBeNull();
  });
});
