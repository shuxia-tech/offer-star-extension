import { describe, expect, it } from "vitest";
import { applyAiMappings, applyManualFieldConfirmation, filterValuesByConfidence, valuesForAutofill } from "../src/shared/ai-mapping";

describe("AI 字段映射", () => {
  it("只更新模型明确返回的字段并保留未映射字段", () => {
    const result = applyAiMappings([
      { id: "a", key: null, label: "求职动机", type: "textarea", elementIndex: 0, confidence: 0 },
      { id: "b", key: "name", label: "姓名", type: "input", elementIndex: 1, confidence: 0.86 }
    ], {
      mappings: [{ fieldId: "a", key: "description", confidence: 0.91, reason: "开放文本问题" }],
      drafts: []
    });
    expect(result[0]?.key).toBe("description");
    expect(result[1]?.key).toBe("name");
  });

  it("低于 0.7 的 AI 映射不会进入自动填写值", () => {
    const values = filterValuesByConfidence({ name: "张三", description: "AI 草稿", city: "北京" }, [
      { id: "name", key: "name", label: "姓名", type: "input", elementIndex: 0, confidence: 0.86 },
      { id: "description", key: "description", label: "求职动机", type: "textarea", elementIndex: 1, confidence: 0.62 },
      { id: "city", key: "city", label: "所在城市", type: "input", elementIndex: 2, confidence: 0.7 }
    ]);
    expect(values).toEqual({ name: "张三", city: "北京" });
  });

  it("敏感字段即使置信度足够也不会进入自动填写值", () => {
    const values = filterValuesByConfidence({ phone: "13800000000" }, [
      { id: "sensitive", key: "phone", label: "紧急联系人电话", type: "input", elementIndex: 0, confidence: 0.95 }
    ]);
    expect(values).toEqual({});
  });

  it("重复字段中有低置信度项时整组保持待确认", () => {
    const values = filterValuesByConfidence({ company: ["甲公司", "乙公司"] }, [
      { id: "company-1", key: "company", label: "公司", type: "input", elementIndex: 0, confidence: 0.86 },
      { id: "company-2", key: "company", label: "公司", type: "input", elementIndex: 1, confidence: 0.65 }
    ]);
    expect(values).toEqual({});
  });

  it("用户确认低置信度字段后可以进入填写队列", () => {
    const fields = [{ id: "motivation", key: null, label: "求职动机", type: "textarea", elementIndex: 0, confidence: 0 }];
    const confirmed = applyManualFieldConfirmation(fields, "motivation", "description");
    expect(confirmed[0]).toMatchObject({ key: "description", confidence: 1 });
    expect(filterValuesByConfidence({ description: "希望参与产品建设" }, confirmed)).toEqual({ description: "希望参与产品建设" });
  });

  it("确认重复字段组中的低置信度项后整组可以填写", () => {
    const fields = [
      { id: "company-1", key: "company" as const, label: "公司", type: "input", elementIndex: 0, confidence: 0.86 },
      { id: "company-2", key: null, label: "任职单位", type: "input", elementIndex: 1, confidence: 0 }
    ];
    const confirmed = applyManualFieldConfirmation(fields, "company-2", "company");
    expect(filterValuesByConfidence({ company: ["甲公司", "乙公司"] }, confirmed)).toEqual({ company: ["甲公司", "乙公司"] });
  });

  it("页面还没有教育输入框时，仍保留简历里的教育经历用来点添加", () => {
    const values = valuesForAutofill({ name: "测试用户", school: "示例大学", company: ["示例公司"] }, [
      { id: "name", key: "name", label: "姓名", type: "input", elementIndex: 0, confidence: 0.86 }
    ]);
    expect(values.school).toBe("示例大学");
    expect(values.company).toEqual(["示例公司"]);
    expect(values.name).toBe("测试用户");
  });
});
