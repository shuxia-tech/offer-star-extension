import type { ResumeProfile, ResumeSummary } from "./messages";
import { richTextToPlain } from "./rich-text";

type LooseRecord = Record<string, unknown>;

/** 将 Offer Star 现有简历模块结构转换成扩展统一填写模型。 */
export function normalizeResumeProfile(payload: unknown): ResumeProfile {
  const root = asRecord(payload);
  const modules = Array.isArray(root.resumeModules) ? root.resumeModules : [];
  const moduleMap = new Map<string, unknown>();
  for (const item of modules) {
    const module = asRecord(item);
    if (module.hasEnable === false) continue;
    const type = String(module.moduleType ?? "");
    const content = parseModuleContent(module.moduleContent);
    moduleMap.set(type, content);
  }

  const basic = asRecord(moduleMap.get("个人信息") ?? moduleMap.get("基本信息"));
  const education = asArray(moduleMap.get("教育经历") ?? moduleMap.get("教育背景"));
  const workExperience = asArray(moduleMap.get("工作经历") ?? moduleMap.get("工作经验"));
  const internship = asArray(moduleMap.get("实习经历") ?? moduleMap.get("实习经验"));
  const projectExperience = asArray(moduleMap.get("项目经历") ?? moduleMap.get("项目经验"));
  const campusExperience = asArray(moduleMap.get("校园经历") ?? moduleMap.get("实践活动"));
  const researchExperience = asArray(moduleMap.get("研究经历"));
  const portfolio = asArray(moduleMap.get("作品集"));
  const otherExperience = asArray(moduleMap.get("其他经历"));
  const awards = asArray(moduleMap.get("荣誉奖项") ?? moduleMap.get("获奖经历") ?? moduleMap.get("荣誉证书"));
  const skillModule = moduleMap.get("专业技能") ?? moduleMap.get("技能与证书") ?? moduleMap.get("其他能力") ?? moduleMap.get("技能/证书/语言/兴趣爱好");
  const advantageModule = asRecord(moduleMap.get("个人优势") ?? moduleMap.get("个人总结") ?? moduleMap.get("自我评价"));
  const skills = readSkills(skillModule);
  const honors = awards.map((item) => ({
    name: plain(item.name ?? item.cert ?? item.title),
    time: plain(item.time),
    level: plain(item.level),
    issuer: plain(item.issuer),
    description: plain(item.description)
  })).filter((item) => item.name || item.time || item.level || item.issuer || item.description);

  return {
    basic: {
      name: stringValue(basic.name),
      phone: stringValue(basic.phone),
      email: stringValue(basic.email),
      age: stringValue(basic.age),
      gender: stringValue(basic.gender),
      currentCity: stringValue(basic.currentCity ?? basic.targetCity),
      targetCity: stringValue(basic.targetCity),
      currentStatus: stringValue(basic.currentStatus),
      targetSalary: stringValue(basic.targetSalary),
      wechat: stringValue(basic.wechat),
      website: stringValue(basic.website),
      github: stringValue(basic.github),
      gitee: stringValue(basic.gitee),
      targetPosition: stringValue(basic.targetPosition),
      height: stringValue(basic.height),
      weight: stringValue(basic.width),
      nation: stringValue(basic.nation),
      nativePlace: stringValue(basic.nativePlace),
      politicalOutlook: stringValue(basic.politicalOutlook),
      maritalStatus: stringValue(basic.maritalStatus)
    },
    education: education.map((item) => ({
      school: stringValue(item.school),
      major: stringValue(item.profession ?? item.major),
      degree: stringValue(item.degree),
      startTime: stringValue(item.startTime ?? item.startDate),
      endTime: stringValue(item.endTime ?? item.endDate),
      description: plain(item.description)
    })),
    workExperience: [...workExperience, ...internship].map((item) => ({
      company: stringValue(item.company),
      position: stringValue(item.position),
      city: stringValue(item.city),
      description: plain(item.description),
      startTime: stringValue(item.startTime ?? item.startDate),
      endTime: stringValue(item.endTime ?? item.endDate)
    })),
    projectExperience: projectExperience.map((item) => ({
      name: stringValue(item.name ?? item.projectName),
      role: stringValue(item.role),
      description: plain(item.description),
      startTime: stringValue(item.startTime ?? item.startDate),
      endTime: stringValue(item.endTime ?? item.endDate)
    })),
    awards: honors.map((item) => item.name).filter(Boolean),
    honors,
    campusExperience: campusExperience.map(readActivity).filter(hasActivityContent),
    researchExperience: researchExperience.map((item) => readActivity({ ...item, name: item.name ?? item.projectName })).filter(hasActivityContent),
    portfolio: portfolio.map((item) => ({
      name: stringValue(item.name),
      url: stringValue(item.url),
      description: plain(item.description)
    })).filter((item) => item.name || item.url || item.description),
    otherExperience: otherExperience.map(readActivity).filter(hasActivityContent),
    skills: skills.skills,
    skillsText: skills.skillsText,
    selfIntroduction: plain(advantageModule.description)
  };
}

function plain(value: unknown) {
  return richTextToPlain(stringValue(value));
}

function readActivity(item: LooseRecord) {
  return {
    name: stringValue(item.name),
    role: stringValue(item.role),
    section: stringValue(item.section),
    address: stringValue(item.address),
    description: plain(item.description),
    startTime: stringValue(item.startTime ?? item.startDate),
    endTime: stringValue(item.endTime ?? item.endDate)
  };
}

function hasActivityContent(item: ReturnType<typeof readActivity>) {
  return Boolean(item.name || item.role || item.section || item.address || item.description || item.startTime || item.endTime);
}

function readSkills(moduleValue: unknown) {
  const record = asRecord(moduleValue);
  if (Array.isArray(record.entries)) {
    const lines = record.entries.map((entry) => {
      const item = asRecord(entry);
      const category = stringValue(item.category);
      const items = plain(item.items);
      return [category, items].filter(Boolean).join("：");
    }).filter(Boolean);
    return { skillsText: lines.join("\n"), skills: lines };
  }
  const skillsText = plain(record.description);
  const skills = [
    ...skillsText.split("\n").map((line) => line.replace(/^•\s*/, "").trim()).filter(Boolean),
    ...asStringArray(record.skills),
    ...asStringArray(record.technology)
  ];
  return { skillsText, skills: [...new Set(skills)] };
}

/** 将简历列表接口的分页结果转换成扩展需要的最小字段。 */
export function normalizeResumeList(payload: unknown): ResumeSummary[] {
  const root = asRecord(payload);
  const list = Array.isArray(root.list) ? root.list : Array.isArray(payload) ? payload : [];
  return list.map((item) => {
    const record = asRecord(item);
    return {
      id: String(record.id ?? ""),
      title: stringValue(record.title) || "未命名简历",
      previewImage: stringValue(record.previewImage),
      updateTime: stringValue(record.updateTime)
    };
  }).filter((item) => item.id);
}

function parseModuleContent(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    console.warn("[Offer Star][Resume] 简历模块内容不是有效 JSON");
    return {};
  }
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as LooseRecord : {};
}

function asArray(value: unknown): LooseRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  const result = stringValue(value);
  return result ? [result] : [];
}
