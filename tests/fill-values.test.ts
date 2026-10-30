import { describe, expect, it } from "vitest";
import { buildResumeFieldValues, inferMajorCategory } from "../src/shared/fill-values";

describe("最终填写值合并", () => {
  it("默认使用简历值，用户确认的 AI 草稿覆盖对应字段", () => {
    const values = buildResumeFieldValues({
      basic: { name: "张三", phone: "", email: "", currentCity: "北京", gender: "男", targetSalary: "15K" },
      education: [],
      workExperience: [],
      skills: ["TypeScript", "React"],
      projectExperience: [{ name: "招聘助手", role: "产品负责人", startTime: "2024-01", endTime: "2024-06", description: "设计自动填表流程" }],
      selfIntroduction: "原始自我介绍"
    }, { description: "用户修改后的求职动机" });
    expect(values.name).toBe("张三");
    expect(values.city).toBe("北京");
    expect(values.description).toBe("用户修改后的求职动机");
    expect(values.gender).toBe("男");
    expect(values.targetSalary).toBe("15K");
    expect(values.skills).toBe("TypeScript、React");
    expect(values.projectName).toBe("招聘助手");
    expect(values.projectRole).toBe("产品负责人");
    expect(values.projectStartDate).toBe("2024-01");
    expect(values.projectEndDate).toBe("2024-06");
    expect(values.projectDescription).toBe("设计自动填表流程");
  });

  it("按最高学历推断专业类别，没有关键词时留空", () => {
    expect(inferMajorCategory("数据科学")).toBe("信息科学与技术类");
    expect(inferMajorCategory("大数据管理与应用")).toBe("信息科学与技术类");
    expect(inferMajorCategory("工商管理")).toBe("商科与管理类");
    expect(inferMajorCategory("舞蹈")).toBe("");
    const values = buildResumeFieldValues({
      basic: { name: "测试用户", phone: "", email: "" },
      education: [
        { school: "本科院校", major: "工商管理", degree: "本科", startTime: "2018-09", endTime: "2022-06" },
        { school: "硕士院校", major: "数据科学", degree: "硕士", startTime: "2024-09", endTime: "2026-06" }
      ],
      workExperience: [{ company: "示例公司", position: "实习" }],
      awards: ["奖学金"],
      campusExperience: [{ name: "学生会" }],
      skills: []
    });
    expect(values.highestMajorCategory).toBe("信息科学与技术类");
    expect(values.highestDegree).toBe("硕士");
    expect(values.degree).toEqual(["本科", "硕士"]);
    expect(values.majorCategory).toEqual(["商科与管理类", "信息科学与技术类"]);
    expect(values.hasInternship).toBe("是");
    expect(values.hasActivity).toBe("是");
    expect(values.hasAward).toBe("是");
  });
});
