import type { DetectedField, FieldValue } from "../shared/messages";
import type { ScanDebugAddButton, ScanDebugSnapshot } from "../content/dom-engine";
import { isSensitiveFieldLabel } from "../shared/field-matching";

export const showScanDebug = import.meta.env.DEV;

export type ScanDebugReport = {
  summary: string;
  hasCandidateForm: boolean;
  rows: Array<{
    label: string;
    key: string;
    type: string;
    confidence: number;
    elementIndex: number;
    resumeValue: string;
    outcome: string;
  }>;
  addButtons: ScanDebugAddButton[];
  fieldsAfter: number;
  clickedAdds: string[];
};

function shorten(value: FieldValue | undefined, index: number) {
  const current = Array.isArray(value) ? value[index] : index === 0 ? value : "";
  const text = String(current ?? "").trim();
  if (!text) return "";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

export function buildScanDebug(input: {
  scanned: DetectedField[];
  values: Record<string, FieldValue>;
  filled: string[];
  failureReasons: Record<string, string>;
  debug?: ScanDebugSnapshot;
}): ScanDebugReport {
  const seen = new Map<string, number>();
  const rows = input.scanned.map((field) => {
    const occurrence = field.key ? seen.get(field.key) ?? 0 : 0;
    if (field.key) seen.set(field.key, occurrence + 1);
    const resumeValue = field.key ? shorten(input.values[field.key], occurrence) : "";
    const failKey = field.key && Array.isArray(input.values[field.key]) ? `${field.key}[${occurrence + 1}]` : field.key ?? "";
    let outcome = "未映射，不会填写";
    if (field.key && isSensitiveFieldLabel(field.label)) outcome = "敏感字段，已排除";
    else if (field.key && !(field.key in input.values)) outcome = "未进入填写";
    else if (field.key && !resumeValue) outcome = "简历该项为空";
    else if (failKey && input.failureReasons[failKey]) outcome = input.failureReasons[failKey];
    else if (field.key && input.filled.includes(field.key)) outcome = "已写入";
    else if (field.key) outcome = "已有内容，未覆盖";
    return {
      label: field.label || "（无标签）",
      key: field.key ?? "—",
      type: field.type,
      confidence: field.confidence,
      elementIndex: field.elementIndex,
      resumeValue: resumeValue || "—",
      outcome
    };
  });
  const mapped = rows.filter((row) => row.key !== "—").length;
  const written = rows.filter((row) => row.outcome === "已写入").length;
  const addButtons = input.debug?.addButtons ?? [];
  const visibleAdds = addButtons.filter((item) => item.visible).length;
  return {
    summary: `扫描 ${rows.length} 项，映射 ${mapped} 项，写入 ${written} 项。添加按钮 ${addButtons.length} 个，可见 ${visibleAdds} 个。`,
    hasCandidateForm: Boolean(input.debug?.hasCandidateForm),
    rows,
    addButtons,
    fieldsAfter: input.debug?.fieldsAfter.length ?? rows.length,
    clickedAdds: input.debug?.clickedAdds ?? []
  };
}

export function ScanDebugPanel({ report }: { report: ScanDebugReport | null }) {
  if (!report) return <section className="resume-card scan-debug"><p className="resume-preview-pending">点一次「自动填充此页面」后，这里会列出本次扫描结果。</p></section>;
  return <section className="resume-card scan-debug">
    <p>{report.summary}</p>
    <p>candidateForm：{report.hasCandidateForm ? "有" : "无"}。填写后字段 {report.fieldsAfter} 项。</p>
    <p>{report.clickedAdds.length ? `已派发点击：${report.clickedAdds.join("、")}` : "这次没有派发添加按钮的点击。"}</p>
    <h4>添加按钮</h4>
    {report.addButtons.length ? <ul>{report.addButtons.map((item, index) => <li key={`${item.text}-${index}`}>
      <strong>{item.visible ? "可见" : "隐藏"}</strong>
      <span>{item.text}</span>
      <span>onclick：{item.onclick ? "有" : "无"}</span>
      <span>click：{item.clickListener}</span>
      <code>{item.keys}</code>
      <small>{item.tag} {item.className}</small>
    </li>)}</ul> : <p>没有认出添加按钮。</p>}
    <h4>字段</h4>
    {report.rows.length ? <ul>{report.rows.map((row) => <li key={`${row.elementIndex}-${row.label}`} className={row.outcome === "已写入" ? "scan-ok" : "scan-miss"}>
      <strong>{row.label}</strong>
      <span>key {row.key}</span>
      <span>类型 {row.type}</span>
      <span>置信度 {row.confidence}</span>
      <span>序号 {row.elementIndex}</span>
      <span>简历值 {row.resumeValue}</span>
      <em>{row.outcome}</em>
    </li>)}</ul> : <p>这次没有扫到字段。</p>}
  </section>;
}
