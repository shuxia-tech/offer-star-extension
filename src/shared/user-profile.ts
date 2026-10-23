import type { UserProfile } from "./messages";

export function normalizeUserProfile(value: unknown): UserProfile {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const nickname = firstText(record.nickname, record.name, record.account) || "Offer Star 用户";
  const avatar = normalizeAvatar(record.avatar);
  return avatar ? { nickname, avatar } : { nickname };
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeAvatar(value: unknown) {
  if (typeof value !== "string") return undefined;
  const avatar = value.trim();
  if (!avatar) return undefined;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(avatar)) return avatar;
  if (/^[a-z0-9+/=\s]{128,}$/i.test(avatar)) return `data:image/png;base64,${avatar.replace(/\s+/g, "")}`;
  try {
    const url = new URL(avatar);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
