import { describe, expect, it, vi } from "vitest";
import { isOfferStarPage, reconnectOfferStarLogin } from "../src/shared/login-reconnect";

describe("显式重新连接官网登录", () => {
  it("仅允许 HTTPS 官网准确来源", () => {
    expect(isOfferStarPage("https://offer.gfjianli.com/extension-login")).toBe(true);
    for (const url of ["http://offer.gfjianli.com/", "https://offer.gfjianli.com.evil.test/", "https://offer.gfjianli.com@evil.test/", undefined]) {
      expect(isOfferStarPage(url)).toBe(false);
    }
  });

  it("官网已经登录时仍重新读取和保存相同凭证", async () => {
    const readToken = vi.fn().mockResolvedValue(" fixture-token ");
    const saveToken = vi.fn();
    const dependencies = { tabs: [{ id: 1, url: "https://offer.gfjianli.com/" }], readToken, saveToken };
    await expect(reconnectOfferStarLogin(dependencies)).resolves.toEqual({ success: true });
    await reconnectOfferStarLogin(dependencies);
    expect(readToken).toHaveBeenCalledTimes(2);
    expect(saveToken).toHaveBeenCalledWith("fixture-token");
  });

  it("未打开官网时提供同一浏览器提示", async () => {
    await expect(reconnectOfferStarLogin({ tabs: [], readToken: vi.fn(), saveToken: vi.fn() })).rejects.toThrow("同一浏览器");
  });

  it("未登录标签页不覆盖授权，继续检查其他官网页", async () => {
    const readToken = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("fixture-token");
    const saveToken = vi.fn();
    await reconnectOfferStarLogin({ tabs: [
      { id: 1, url: "https://offer.gfjianli.com/", active: true },
      { id: 2, url: "https://offer.gfjianli.com/" }
    ], readToken, saveToken });
    expect(saveToken).toHaveBeenCalledTimes(1);
    expect(saveToken).toHaveBeenCalledWith("fixture-token");
  });

  it("权限错误和没有凭证分别给出提示，不修改存储", async () => {
    const saveToken = vi.fn();
    const tabs = [{ id: 1, url: "https://offer.gfjianli.com/" }];
    await expect(reconnectOfferStarLogin({ tabs, readToken: vi.fn().mockRejectedValue(new Error("private")), saveToken })).rejects.toThrow("允许插件访问");
    await expect(reconnectOfferStarLogin({ tabs, readToken: vi.fn().mockResolvedValue(null), saveToken })).rejects.toThrow("尚未提供登录凭证");
    expect(saveToken).not.toHaveBeenCalled();
  });
});
