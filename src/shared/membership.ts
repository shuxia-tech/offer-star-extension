export type MembershipStatus = "unknown" | "free" | "vip" | "lifetime";

/** 官网以 offerMemberExpirationTime 判定会员，空值表示免费版。 */
export function normalizeMembershipExpiration(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(new Date(value).getTime()) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const date = value.trim();
  if (!date) return null;
  const parts = date.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!parts) return undefined;
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = parts;
  if (+month < 1 || +month > 12 || +day < 1 || +day > new Date(+year, +month, 0).getDate() || +hour > 23 || +minute > 59 || +second > 59) return undefined;
  const timestamp = new Date(parts[4] === undefined ? `${date}T00:00:00` : date.replace(" ", "T")).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function getMembershipStatus(expiresAt: number | null | undefined, now = Date.now()): MembershipStatus {
  if (expiresAt === undefined || (expiresAt !== null && !Number.isFinite(new Date(expiresAt).getTime()))) return "unknown";
  if (expiresAt === null || expiresAt <= now) return "free";
  return expiresAt > new Date(2100, 0, 1).getTime() ? "lifetime" : "vip";
}
