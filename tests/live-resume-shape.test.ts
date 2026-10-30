import { describe, expect, it } from "vitest";
import { buildResumeFieldValues } from "../src/shared/fill-values";
import { normalizeResumeProfile } from "../src/shared/resume-profile";

/** 结构对齐线上用来测真实网站的那份简历，个人信息换成示例值。 */
const liveResumeShape = {
  resumeModules: [
    {
      moduleType: "基本信息",
      hasEnable: true,
      moduleContent: JSON.stringify({
        name: "测试用户",
        phone: "13800000000",
        email: "test@example.com",
        age: "23",
        gender: "男",
        currentCity: "",
        targetCity: "",
        currentStatus: "硕士在读",
        targetPosition: "数据科学相关岗位、产品相关岗位",
        targetSalary: "",
        politicalOutlook: "党员"
      })
    },
    {
      moduleType: "教育经历",
      hasEnable: true,
      moduleContent: JSON.stringify([
        { school: "示例硕士院校", profession: "数据科学", degree: "硕士", startTime: "2025-08", endTime: "Present", description: "<p>相关课程</p>" },
        { school: "示例本科院校", profession: "大数据管理与应用", degree: "本科", startTime: "2020-09", endTime: "2024-06", description: "<p>相关课程</p>" }
      ])
    },
    {
      moduleType: "工作经历",
      hasEnable: true,
      moduleContent: JSON.stringify([
        { company: "示例研究中心", position: "研究助理", startTime: "2025-03", endTime: "2025-06", description: "<p>语音信号分析</p>" }
      ])
    }
  ]
};

describe("线上测试简历的填写结果", () => {
  const profile = normalizeResumeProfile(liveResumeShape);
  const values = buildResumeFieldValues(profile);

  it("手机号、性别、最高学历按这份简历的基本信息和教育经历得出", () => {
    expect(profile.basic.gender).toBe("男");
    expect(profile.basic.phone).toBe("13800000000");
    expect(profile.education.map((item) => item.degree)).toEqual(["硕士", "本科"]);
    expect(values.gender).toBe("男");
    expect(values.phone).toBe("13800000000");
    expect(values.highestDegree).toBe("硕士");
    expect(values.school).toEqual(["示例硕士院校", "示例本科院校"]);
    expect(values.major).toEqual(["数据科学", "大数据管理与应用"]);
    expect(values.educationStartDate).toEqual(["2025-08", "2020-09"]);
    expect(values.educationEndDate).toEqual(["Present", "2024-06"]);
    expect(values).not.toHaveProperty("politicalOutlook");
  });
});
