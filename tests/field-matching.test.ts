import { describe, expect, it } from "vitest";
import { guessFieldKey, isSensitiveFieldLabel, shouldFillExistingValue } from "../src/shared/field-matching";

describe("简历字段识别", () => {
  it("识别中文姓名字段", () => {
    expect(guessFieldKey("真实姓名")).toEqual({ key: "name", confidence: 0.86 });
  });

  it("识别英文邮箱字段", () => {
    expect(guessFieldKey("candidate_email").key).toBe("email");
  });

  it("识别照片字段为需要确认", () => {
    expect(guessFieldKey("证件照上传").key).toBe("photo");
  });

  it("识别简历附件字段为需要确认", () => {
    expect(guessFieldKey("上传简历附件").key).toBe("attachment");
    expect(guessFieldKey("作品集或证书").key).toBe("attachment");
  });

  it("识别工作经历起止日期", () => {
    expect(guessFieldKey("入职日期").key).toBe("startDate");
    expect(guessFieldKey("离职日期").key).toBe("endDate");
  });

  it.each([
    ["性别", "gender"], ["年龄", "age"], ["期望城市", "targetCity"],
    ["求职状态", "currentStatus"], ["期望薪资", "targetSalary"], ["微信号", "wechat"],
    ["个人网站", "website"], ["项目角色", "projectRole"], ["技术栈", "skills"],
    ["项目开始时间", "projectStartDate"], ["项目结束时间", "projectEndDate"], ["项目介绍", "projectDescription"]
  ])("识别扩展个人信息字段 %s", (label, key) => {
    expect(guessFieldKey(label).key).toBe(key);
  });

  it("识别申请表里的教育和经历开关，不猜测调剂与渠道", () => {
    expect(guessFieldKey("入学日期").key).toBe("educationStartDate");
    expect(guessFieldKey("毕业日期").key).toBe("educationEndDate");
    expect(guessFieldKey("学校名称").key).toBe("school");
    expect(guessFieldKey("专业名称").key).toBe("major");
    expect(guessFieldKey("专业类别").key).toBe("majorCategory");
    expect(guessFieldKey("最高学历专业类别").key).toBe("highestMajorCategory");
    expect(guessFieldKey("专业技能").key).toBe("skills");
    expect(guessFieldKey("意向城市").key).toBe("targetCity");
    expect(guessFieldKey("是否有实习经验").key).toBe("hasInternship");
    expect(guessFieldKey("是否有校内外实践活动经历").key).toBe("hasActivity");
    expect(guessFieldKey("是否有获奖经验").key).toBe("hasAward");
    expect(guessFieldKey("是否服从岗位调剂").key).toBeNull();
    expect(guessFieldKey("毕业前最早可实习时间").key).toBeNull();
    expect(guessFieldKey("你是从哪个渠道获取招聘信息的").key).toBeNull();
    expect(guessFieldKey("每周可出勤天数（要求3天及以上）").key).toBeNull();
    expect(guessFieldKey("英语等级").key).toBeNull();
  });

  it("项目描述优先于通用工作描述", () => {
    expect(guessFieldKey("projectDescription").key).toBe("projectDescription");
    expect(guessFieldKey("项目描述").key).toBe("projectDescription");
  });

  it("未知字段不会误匹配", () => {
    expect(guessFieldKey("自定义问题一")).toEqual({ key: null, confidence: 0 });
  });

  it.each([
    ["given-name", "name"],
    ["family-name", "name"],
    ["tel", "phone"],
    ["email", "email"],
    ["address-level2", "city"],
    ["organization", "company"],
    ["organization-title", "position"]
  ])("识别 autocomplete 标准 token %s", (label, key) => {
    expect(guessFieldKey(label).key).toBe(key);
  });

  it("期望城市优先于通用城市", () => {
    expect(guessFieldKey("target-city 期望城市").key).toBe("targetCity");
  });

  it.each(["身份证号", "政治面貌", "银行卡号", "紧急联系人电话"])('识别敏感字段 "%s"', (label) => {
    expect(isSensitiveFieldLabel(label)).toBe(true);
  });

  it("普通联系电话不被误判为敏感字段", () => {
    expect(isSensitiveFieldLabel("联系电话")).toBe(false);
  });
});

describe("填写模式", () => {
  it("增量模式跳过已有内容", () => {
    expect(shouldFillExistingValue("incremental", "已有内容")).toBe(false);
  });

  it("增量模式填写空字段", () => {
    expect(shouldFillExistingValue("incremental", "  ")).toBe(true);
  });

  it("覆盖模式总是允许填写", () => {
    expect(shouldFillExistingValue("overwrite", "已有内容")).toBe(true);
  });
});
