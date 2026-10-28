import type { FieldKey } from "./messages";

const fieldPattern: Array<[FieldKey, RegExp]> = [
  ["hasInternship", /是否有实习经验|是否有工作经验|是否有工作经历/],
  ["hasActivity", /是否有校内外实践|是否有实践活动|是否有项目经历/],
  ["hasAward", /是否有获奖/],
  ["highestMajorCategory", /最高学历专业类别/],
  ["majorCategory", /专业类别/],
  ["educationStartDate", /入学日期|入学时间/],
  ["educationEndDate", /毕业日期|毕业时间/],
  ["projectName", /项目名称|项目名|project.?name/i],
  ["name", /姓名|真实姓名|given.?name|family.?name|name|full.?name/i],
  ["phone", /手机|电话|手机号|phone|mobile|tel|telephone/i],
  ["email", /邮箱|电子邮件|email|mail/i],
  ["targetCity", /期望城市|意向城市|目标城市|target.?city/i],
  ["city", /城市|所在地|居住地|address.?level[２2]|city|location/i],
  ["age", /年龄|age/i],
  ["gender", /性别|gender|sex/i],
  ["currentStatus", /当前状态|求职状态|到岗状态|current.?status/i],
  ["targetSalary", /期望薪资|薪资要求|期望待遇|target.?salary|salary|compensation/i],
  ["wechat", /微信号|微信|wechat/i],
  ["github", /github/i],
  ["website", /个人网站|个人主页|website|homepage/i],
  ["targetPosition", /应聘职位|求职岗位|目标职位|期望职位|期望岗位|职位名称|job.?title/i],
  ["school", /学校|院校|毕业院校|school|university|college/i],
  ["major", /专业名称|所学专业|major|discipline/i],
  ["degree", /学历|学位|degree|education/i],
  ["company", /公司|工作单位|company|employer|organization(?!.?title)/i],
  ["position", /职位|岗位|职务|position|title|organization.?title/i],
  ["projectStartDate", /项目开始时间|项目起始日期|project.?start|project.*开始/i],
  ["projectEndDate", /项目结束时间|项目终止日期|project.?end|project.*结束/i],
  ["projectDescription", /项目介绍|项目内容|项目描述|project.?description/i],
  ["startDate", /入职日期|开始日期|起始日期|开始时间|start[\s-]?date/i],
  ["endDate", /离职日期|结束日期|终止日期|结束时间|end[\s-]?date/i],
  ["description", /工作内容|岗位职责|项目描述|自我介绍|个人优势|summary|description/i],
  ["skills", /专业技能|技能特长|技术栈|skills?|technology/i],
  ["projectRole", /项目角色|项目职责|project.?role/i],
  ["photo", /照片|头像|证件照|photo|avatar|portrait/i],
  ["attachment", /简历附件|附件上传|作品集|证书|证明材料|resume.?file|attachment|portfolio|certificate/i]
];

const sensitiveFieldPattern = /身份证|证件号码|护照|银行卡|银行账号|政治面貌|民族|婚姻|婚育|宗教|健康状况|病史|残疾|紧急联系人|紧急联系电话|社保账号/i;

export function guessFieldKey(label: string): { key: FieldKey | null; confidence: number } {
  const match = fieldPattern.find(([, pattern]) => pattern.test(label));
  if (!match) return { key: null, confidence: 0 };
  // “是否服从岗位调剂”这类问答会误撞到“岗位”，只有明确的经历开关才自动对应。
  if (/^是否/.test(label.trim()) && match[0] !== "hasInternship" && match[0] !== "hasActivity" && match[0] !== "hasAward") {
    return { key: null, confidence: 0 };
  }
  return { key: match[0], confidence: 0.86 };
}

/** 涉及身份、财务、人口统计或健康的信息默认禁止自动填写。 */
export function isSensitiveFieldLabel(label: string) {
  return sensitiveFieldPattern.test(label);
}

export function shouldFillExistingValue(mode: "incremental" | "overwrite", currentValue: string) {
  return mode === "overwrite" || !currentValue.trim();
}
