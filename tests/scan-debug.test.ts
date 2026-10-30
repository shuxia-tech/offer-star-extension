import { describe, expect, it } from "vitest";
import { buildScanDebug } from "../src/panel/scan-debug";
import type { DetectedField } from "../src/shared/messages";

const field = (partial: Partial<DetectedField>): DetectedField => ({
  id: "f",
  label: "学校名称",
  type: "text",
  elementIndex: 0,
  confidence: 0.86,
  ...partial
});

describe("扫描结果", () => {
  it("列出字段、映射 key、类型，并标出隐藏的添加按钮", () => {
    const report = buildScanDebug({
      scanned: [field({ key: "school", label: "学校名称", type: "text", elementIndex: 2 })],
      values: { school: ["示例大学"] },
      filled: ["school"],
      failureReasons: {},
      debug: {
        hasCandidateForm: true,
        fieldsAfter: [field({ key: "school" })],
        clickedAdds: ["添加 教育背景"],
        addButtons: [
          { text: "添加 教育背景", tag: "button", className: "add_btn", visible: false, keys: "school", onclick: false, clickListener: "未识别到" },
          { text: "添加 教育背景", tag: "button", className: "add_btn", visible: true, keys: "school", onclick: true, clickListener: "识别到 onclick" }
        ]
      }
    });
    expect(report.rows[0]).toMatchObject({ label: "学校名称", key: "school", type: "text", outcome: "已写入" });
    expect(report.addButtons.filter((item) => !item.visible)).toHaveLength(1);
    expect(report.hasCandidateForm).toBe(true);
  });
});
