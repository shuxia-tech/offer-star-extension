import { describe, expect, it } from "vitest";
import { readFillStats, recordSuccessfulFill } from "../src/shared/fill-stats";

const today = new Date(2026, 9, 31, 23, 59);
const tomorrow = new Date(2026, 10, 1, 0, 1);

describe("成功填写统计", () => {
  it("没有历史数据时从零开始，不把旧填写质量数据冒充历史次数", () => {
    expect(readFillStats(undefined, today)).toEqual({ day: "2026-10-31", today: 0, total: 0 });
    expect(readFillStats({ filled: 20, attempts: 4 }, today).total).toBe(0);
  });

  it("一轮写入多个字段只计一次，且不修改原记录", () => {
    const previous = { day: "2026-10-31", today: 2, total: 9 };
    expect(recordSuccessfulFill(previous, 12, today)).toEqual({ day: "2026-10-31", today: 3, total: 10 });
    expect(previous.total).toBe(9);
  });

  it.each([0, -1, NaN, Infinity, 1.5])("失败、空填写和无效数量 %s 不增加次数", (filled) => {
    const previous = { day: "2026-10-31", today: 2, total: 9 };
    expect(recordSuccessfulFill(previous, filled, today)).toEqual(previous);
  });

  it("跨天只清零今日次数，累计继续保留", () => {
    const previous = { day: "2026-10-31", today: 2, total: 9 };
    expect(readFillStats(previous, tomorrow)).toEqual({ day: "2026-11-01", today: 0, total: 9 });
    expect(recordSuccessfulFill(previous, 1, tomorrow)).toEqual({ day: "2026-11-01", today: 1, total: 10 });
  });

  it("每日五次是目标而不是使用上限", () => {
    expect(recordSuccessfulFill({ day: "2026-10-31", today: 5, total: 5 }, 1, today).today).toBe(6);
  });

  it("损坏数据不能产生负数、无穷大或溢出", () => {
    expect(readFillStats({ day: "2026-10-31", today: -3, total: Infinity }, today).total).toBe(0);
    expect(readFillStats({ day: "2026-10-31", today: 4, total: 1 }, today).total).toBe(4);
    expect(recordSuccessfulFill({ total: Number.MAX_SAFE_INTEGER }, 1, today).total).toBe(Number.MAX_SAFE_INTEGER);
  });
});
