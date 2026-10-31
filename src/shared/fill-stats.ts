/** 每次至少成功写入一个字段才计一次，只保存日期和数量。 */
export type FillStats = { day: string; today: number; total: number };

export function fillStatsDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function readFillStats(value: unknown, now = new Date()): FillStats {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const day = fillStatsDay(now);
  const today = raw.day === day ? count(raw.today) : 0;
  return { day, today, total: Math.max(count(raw.total), today) };
}

export function recordSuccessfulFill(value: unknown, filledCount: number, now = new Date()): FillStats {
  const stats = readFillStats(value, now);
  if (!Number.isSafeInteger(filledCount) || filledCount <= 0 || stats.total === Number.MAX_SAFE_INTEGER) return stats;
  return { day: stats.day, today: stats.today + 1, total: stats.total + 1 };
}
