import { describe, expect, it } from "vitest";
import { normalizeResumeList, normalizeResumeProfile } from "../src/shared/resume-profile";

const workspace = {
  active: "resume-1",
  resumes: [
    {
      id: "resume-1",
      name: "校招简历",
      updatedAt: "2026-11-01T00:00:00.000Z",
      data: {
        basic: [{ 姓名: "张三", 手机号: "13800000000", 邮箱: "zhang@example.com", 性别: "男", 微信号: "zhang-wx", 当前所在地: "北京", 政治面貌: "中共党员" }],
        intent: [{ 期望职位: "产品经理", 期望城市: "上海", 期望薪资: "20K-30K" }],
        education: [{ 学校名称: "测试大学", 专业: "计算机科学", 学历: "本科", 开始日期: "2020-09", 结束日期: "2024-06", 专业描述: "<p>相关课程</p>" }],
        internship: [{ 公司名称: "测试公司", 职位名称: "产品助理", 开始日期: "2024-07", 结束日期: "至今", 工作内容: "<p>负责需求分析</p>" }],
        project: [{ 项目名称: "招聘助手", 担任角色: "产品负责人", 开始日期: "2024-01", 结束日期: "2024-06", 项目描述: "设计自动填表流程", 个人职责: "不使用这段" }],
        intro: [{ 自我介绍: "善于跨团队协作" }],
        english: [{ 水平: "大学英语六级 CET-6" }],
        computer: [{ 技能名称: "TypeScript" }],
        award: [{ 奖项名称: "奖学金" }]
      }
    },
    { id: "", name: "无效" }
  ]
};

describe("极速海投简历数据", () => {
  it("从工作区 JSON 读取简历列表，并按中文字段生成填写数据", () => {
    const payload = { content: JSON.stringify(workspace) };
    expect(normalizeResumeList(payload)).toEqual([
      { id: "resume-1", title: "校招简历", previewImage: "", updateTime: "2026-11-01T00:00:00.000Z" }
    ]);
    const profile = normalizeResumeProfile(payload);
    expect(profile.basic).toMatchObject({ name: "张三", phone: "13800000000", email: "zhang@example.com", gender: "男", targetCity: "上海", targetSalary: "20K-30K", targetPosition: "产品经理", wechat: "zhang-wx", currentCity: "北京" });
    expect(profile.education[0]).toEqual({ school: "测试大学", major: "计算机科学", degree: "本科", startTime: "2020-09", endTime: "2024-06", description: "相关课程" });
    expect(profile.workExperience[0]).toMatchObject({ company: "测试公司", position: "产品助理", startTime: "2024-07", endTime: "至今", description: "负责需求分析" });
    expect(profile.projectExperience?.[0]).toEqual({ name: "招聘助手", role: "产品负责人", startTime: "2024-01", endTime: "2024-06", description: "设计自动填表流程" });
    expect(profile.selfIntroduction).toBe("善于跨团队协作");
    expect(profile.languages).toEqual(["大学英语六级 CET-6"]);
    expect(profile.skills).toEqual(["TypeScript"]);
    expect(profile.awards).toEqual(["奖学金"]);
  });

  it("项目描述为空时才使用个人职责，计算机技能不会写成语言类型", () => {
    const profile = normalizeResumeProfile({
      id: "resume-2",
      name: "第二份",
      data: {
        project: [{ 项目名称: "门禁系统", 个人职责: "采集图片并训练模型" }],
        computer: [{ 技能名称: "Python" }],
        language: [{ 语种: "日语" }]
      }
    });
    expect(profile.projectExperience?.[0]?.description).toBe("采集图片并训练模型");
    expect(profile.skills).toEqual(["Python"]);
    expect(profile.languages).toEqual(["日语"]);
  });

  it("空工作区没有简历，坏的 JSON 也不抛出简历正文", () => {
    expect(normalizeResumeList({ content: "" })).toEqual([]);
    expect(normalizeResumeList({ content: "{" })).toEqual([]);
    expect(normalizeResumeProfile({ id: "x", data: {} }).basic.name).toBe("");
  });
});
