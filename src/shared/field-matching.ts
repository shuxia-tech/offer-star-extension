import type { FieldKey } from "./messages";
import { addActionPrefixes, blockedActionTerms, consentLabelTerms, fieldLabelAliases, fieldLabelPatterns, sectionAddRules, sensitiveLabelTerms } from "./field-catalog";

const compiledPatterns = fieldLabelPatterns.map((item) => ({ key: item.key, pattern: new RegExp(item.pattern, item.flags) }));
const aliasIndex = new Map<string, FieldKey>();
for (const [key, labels] of Object.entries(fieldLabelAliases) as Array<[FieldKey, readonly string[]]>) {
  for (const label of labels) aliasIndex.set(normalizeFieldLabel(label), key);
}

export function normalizeFieldLabel(label: string) {
  return label.replace(/[\s*＊:：_\-]/g, "").toLowerCase();
}

export function guessFieldKey(label: string): { key: FieldKey | null; confidence: number } {
  const alias = aliasIndex.get(normalizeFieldLabel(label));
  if (alias) return { key: alias, confidence: 0.86 };
  const match = compiledPatterns.find((item) => item.pattern.test(label));
  if (!match) return { key: null, confidence: 0 };
  if (/^是否/.test(label.trim()) && match.key !== "hasInternship" && match.key !== "hasActivity" && match.key !== "hasAward") {
    return { key: null, confidence: 0 };
  }
  return { key: match.key, confidence: 0.86 };
}

export function isPhoneFieldLabel(label: string) {
  return guessFieldKey(label).key === "phone";
}

export function isConsentLabel(label: string) {
  return consentLabelTerms.some((term) => label.includes(term));
}

export function isBlockedActionLabel(label: string) {
  return blockedActionTerms.some((term) => label.includes(term));
}

export function isSensitiveFieldLabel(label: string) {
  return sensitiveLabelTerms.some((term) => label.includes(term));
}

/** 添加按钮去掉前缀后，对应要展开的简历字段。文案可以是区块名，也可以是该区块里的字段名。 */
export function sectionAddKeys(label: string): readonly FieldKey[] | null {
  const text = normalizeFieldLabel(label).replace(/^[+＋]/, "");
  const prefix = [...addActionPrefixes].sort((left, right) => normalizeFieldLabel(right).length - normalizeFieldLabel(left).length)
    .find((item) => text.includes(normalizeFieldLabel(item)));
  if (!prefix) return null;
  const normalizedPrefix = normalizeFieldLabel(prefix);
  const body = text.slice(text.indexOf(normalizedPrefix) + normalizedPrefix.length);
  if (body.length < 2) return null;
  for (const rule of sectionAddRules) {
    const matchesTerm = rule.terms.some((term) => {
      const normalized = normalizeFieldLabel(term);
      return body === normalized || body.includes(normalized) || normalized.includes(body);
    });
    const matchesField = rule.keys.some((key) => fieldLabelAliases[key].some((alias) => {
      const normalized = normalizeFieldLabel(alias);
      return normalized.length >= 2 && (body === normalized || body.includes(normalized));
    }));
    if (matchesTerm || matchesField) return rule.keys;
  }
  return null;
}

export function shouldFillExistingValue(mode: "incremental" | "overwrite", currentValue: string) {
  return mode === "overwrite" || !currentValue.trim();
}
