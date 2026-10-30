import type { AiAnalysisResult, DetectedField, FieldKey, FieldValue } from "./messages";
import { isSensitiveFieldLabel } from "./field-matching";
import { sectionAddRules } from "./field-catalog";

/** 只应用模型返回的字段映射，不直接写入页面；写入仍需经过用户确认。 */
export function applyAiMappings(fields: DetectedField[], result: AiAnalysisResult): DetectedField[] {
  return fields.map((field) => {
    const mapping = result.mappings.find((item) => item.fieldId === field.id);
    return mapping ? { ...field, key: mapping.key, confidence: mapping.confidence } : field;
  });
}

/** 只允许达到置信度门槛的字段进入自动填写；低置信度字段必须由用户手动确认。 */
export function filterValuesByConfidence(values: Record<string, FieldValue>, fields: DetectedField[], minimum = 0.7) {
  const allowed = new Set<string>();
  for (const field of fields) {
    if (field.key && field.confidence >= minimum && !isSensitiveFieldLabel(field.label)) allowed.add(field.key);
  }
  return Object.fromEntries(Object.entries(values).filter(([key]) => {
    const sameKeyFields = fields.filter((field) => field.key === key);
    return sameKeyFields.length > 0 && sameKeyFields.every((field) => field.confidence >= minimum && !isSensitiveFieldLabel(field.label)) && allowed.has(key);
  })) as Record<string, FieldValue>;
}

function sectionValuePresent(value: FieldValue | undefined) {
  return Array.isArray(value) ? value.some((item) => String(item ?? "").trim()) : Boolean(String(value ?? "").trim());
}

/** 页面上还没有教育、实习这些输入框时，仍保留简历里的对应值，用来决定要点几次添加。 */
export function valuesForAutofill(values: Record<string, FieldValue>, fields: DetectedField[], minimum = 0.7) {
  const filtered = filterValuesByConfidence(values, fields, minimum);
  for (const key of sectionAddRules.flatMap((rule) => rule.keys)) {
    if (key in filtered || fields.some((field) => field.key === key)) continue;
    if (sectionValuePresent(values[key])) filtered[key] = values[key];
  }
  return filtered;
}

/** 用户在网页内悬浮面板中确认字段含义后，将该字段提升为可填写状态。 */
export function applyManualFieldConfirmation(fields: DetectedField[], fieldId: string, key: FieldKey | null) {
  return fields.map((field) => field.id === fieldId
    ? { ...field, key, confidence: key ? 1 : 0 }
    : field);
}
