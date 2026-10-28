import type { FieldValue, ResumeProfile } from "./messages";

const majorCategories: Array<[RegExp, string]> = [
  [/公共卫生|健康管理/, "公共卫生与健康管理类"],
  [/药学|医学|临床|护理|口腔/, "医学与药学类"],
  [/生物/, "生物科学与技术类"],
  [/化学|化工/, "化学与化工类"],
  [/统计|数学/, "数学与统计学类"],
  [/计算机|软件|数据|信息|人工智能|电子|通信|网络/, "信息科学与技术类"],
  [/金融|会计|工商|管理|经济|市场|人力|商务/, "商科与管理类"],
  [/法学|法律|文学|历史|哲学|新闻|政治/, "文史哲法类"]
];

/** 把简历专业名称映射到招聘表单里的专业类别。匹配不上时留空，不猜“其他类”。 */
export function inferMajorCategory(major: string) {
  const text = major.trim();
  if (!text) return "";
  return majorCategories.find(([pattern]) => pattern.test(text))?.[1] ?? "";
}

function degreeRank(degree = "") {
  if (/博士/.test(degree)) return 4;
  if (/硕士|研究生/.test(degree)) return 3;
  if (/本科|学士/.test(degree)) return 2;
  if (/大专|专科/.test(degree)) return 1;
  return 0;
}

/** 将简历基础数据和用户确认后的 AI 草稿合并为最终填写值。 */
export function buildResumeFieldValues(resume: ResumeProfile, overrides: Record<string, string> = {}): Record<string, FieldValue> {
  const work = resume.workExperience;
  const education = resume.education;
  const projects = resume.projectExperience ?? [];
  const categories = education.map((item) => inferMajorCategory(item.major ?? ""));
  const highest = [...education].sort((left, right) => degreeRank(right.degree) - degreeRank(left.degree))[0];
  const repeated = (items: string[]) => items.length > 1 ? items : (items[0] ?? "");
  const values: Record<string, FieldValue> = {
    name: resume.basic.name,
    phone: resume.basic.phone,
    email: resume.basic.email,
    city: resume.basic.currentCity ?? "",
    targetCity: resume.basic.targetCity ?? "",
    age: resume.basic.age ?? "",
    gender: resume.basic.gender ?? "",
    currentStatus: resume.basic.currentStatus ?? "",
    targetSalary: resume.basic.targetSalary ?? "",
    wechat: resume.basic.wechat ?? "",
    website: resume.basic.website ?? "",
    github: resume.basic.github ?? "",
    targetPosition: resume.basic.targetPosition ?? "",
    school: repeated(education.map((item) => item.school)),
    major: repeated(education.map((item) => item.major ?? "")),
    majorCategory: repeated(categories),
    highestMajorCategory: highest ? inferMajorCategory(highest.major ?? "") : "",
    degree: repeated(education.map((item) => item.degree ?? "")),
    educationStartDate: repeated(education.map((item) => item.startTime ?? "")),
    educationEndDate: repeated(education.map((item) => item.endTime ?? "")),
    hasInternship: work.length ? "是" : "",
    hasActivity: projects.length || resume.campusExperience?.length ? "是" : "",
    hasAward: resume.honors?.length || resume.awards?.length ? "是" : "",
    company: repeated(work.map((item) => item.company)),
    position: repeated(work.map((item) => item.position ?? "")),
    startDate: repeated(work.map((item) => item.startTime ?? "")),
    endDate: repeated(work.map((item) => item.endTime ?? "")),
    description: repeated(work.map((item) => item.description ?? resume.selfIntroduction ?? "")),
    skills: resume.skills.join("、"),
    projectName: repeated(projects.map((item) => item.name)),
    projectRole: repeated(projects.map((item) => item.role ?? "")),
    projectStartDate: repeated(projects.map((item) => item.startTime ?? "")),
    projectEndDate: repeated(projects.map((item) => item.endTime ?? "")),
    projectDescription: repeated(projects.map((item) => item.description ?? ""))
  };
  return { ...values, ...overrides };
}
