import { describe, expect, it } from "vitest";
import { buildResumeFieldValues } from "../src/shared/fill-values";
import { normalizeResumeProfile } from "../src/shared/resume-profile";

/** 结构对齐极速海投简历编辑器，个人信息换成示例值。 */
const liveResumeShape = {
  id: "resume-live",
  name: "测试简历",
  data: {
    basic: [{ 姓名: "测试用户", 手机号: "13800000000", 邮箱: "test@example.com", 性别: "男", 政治面貌: "中共党员" }],
    intent: [{ 期望职位: "数据科学相关岗位、产品相关岗位" }],
    education: [
      { 学校名称: "示例硕士院校", 专业: "数据科学", 学历: "硕士", 开始日期: "2025-08", 结束日期: "至今" },
      { 学校名称: "示例本科院校", 专业: "大数据管理与应用", 学历: "本科", 开始日期: "2020-09", 结束日期: "2024-06" }
    ],
    internship: [{ 公司名称: "示例研究中心", 职位名称: "研究助理", 开始日期: "2025-03", 结束日期: "2025-06", 工作内容: "语音信号分析" }],
    project: [
      { 项目名称: "示例项目甲", 担任角色: "项目参与者", 开始日期: "2024-03", 结束日期: "至今", 项目描述: "文本分类" },
      { 项目名称: "示例项目乙", 担任角色: "项目负责人", 开始日期: "2023-09", 结束日期: "2024-06", 项目描述: "目标检测" }
    ]
  }
};

describe("极速海投简历的填写结果", () => {
  const profile = normalizeResumeProfile(liveResumeShape);
  const values = buildResumeFieldValues(profile);

  it("手机号、性别、学历和项目时间按编辑器里的中文字段得出", () => {
    expect(profile.basic.gender).toBe("男");
    expect(profile.basic.phone).toBe("13800000000");
    expect(values.gender).toBe("男");
    expect(values.phone).toBe("13800000000");
    expect(values.highestDegree).toBe("硕士");
    expect(values.school).toEqual(["示例硕士院校", "示例本科院校"]);
    expect(values.major).toEqual(["数据科学", "大数据管理与应用"]);
    expect(values.educationStartDate).toEqual(["2025-08", "2020-09"]);
    expect(values.educationEndDate).toEqual(["至今", "2024-06"]);
    expect(values.projectName).toEqual(["示例项目甲", "示例项目乙"]);
    expect(values.projectStartDate).toEqual(["2024-03", "2023-09"]);
    expect(values.projectEndDate).toEqual(["至今", "2024-06"]);
    expect(values.projectRole).toEqual(["项目参与者", "项目负责人"]);
    expect(values).not.toHaveProperty("politicalOutlook");
  });
});
