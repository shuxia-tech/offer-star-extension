import type { ResumeProfile, ResumeSummary } from "./messages";
import { richTextToPlain } from "./rich-text";

type LooseRecord = Record<string, unknown>;

type JisuRecord = Record<string, unknown>;
type JisuDoc = { id?: unknown; name?: unknown; updatedAt?: unknown; data?: Record<string, unknown> };

/** 把极速海投工作区或单份简历转换成统一填写模型。字段名使用简历编辑器里的中文标题。 */
export function normalizeResumeProfile(payload: unknown): ResumeProfile {
  const doc = jisuDoc(payload) ?? jisuDoc(activeResume(parseJisuWorkspace(payload)));
  return doc ? profileFromJisuDoc(doc) : emptyProfile();
}

/** 极速海投把全部简历放在一份工作区里。接口 data 为 { content }，content 是工作区 JSON。 */
export function parseJisuWorkspace(payload: unknown): { active: string; resumes: JisuDoc[] } {
  const root = asRecord(unwrapContent(payload));
  const resumes = Array.isArray(root.resumes) ? root.resumes.map(asRecord).filter(isJisuDoc) : [];
  return { active: stringValue(root.active), resumes };
}

/** 工作区里的简历列表。没有 id 的记录不展示。 */
export function normalizeResumeList(payload: unknown): ResumeSummary[] {
  return parseJisuWorkspace(payload).resumes.flatMap((resume) => {
    const id = stringValue(resume.id);
    if (!id) return [];
    return [{ id, title: stringValue(resume.name) || "未命名简历", previewImage: "", updateTime: stringValue(resume.updatedAt) }];
  });
}

function profileFromJisuDoc(doc: JisuDoc): ResumeProfile {
  const basic = row(doc, "basic");
  const intent = row(doc, "intent");
  const education = rows(doc, "education").map((item) => ({
    school: cell(item, "学校名称"),
    major: cell(item, "专业"),
    degree: cell(item, "学历"),
    startTime: cell(item, "开始日期"),
    endTime: cell(item, "结束日期"),
    description: plain(cell(item, "专业描述") || cell(item, "专业主要课程"))
  }));
  const workExperience = [...rows(doc, "internship"), ...rows(doc, "work")].map((item) => ({
    company: cell(item, "公司名称"),
    position: cell(item, "职位名称"),
    city: cell(item, "工作城市"),
    description: plain(cell(item, "工作内容")),
    startTime: cell(item, "开始日期"),
    endTime: cell(item, "结束日期")
  })).filter((item) => item.company || item.position || item.description || item.startTime || item.endTime);
  const projectExperience = rows(doc, "project").map((item) => ({
    name: cell(item, "项目名称"),
    role: cell(item, "担任角色"),
    description: plain(cell(item, "项目描述") || cell(item, "个人职责")),
    startTime: cell(item, "开始日期"),
    endTime: cell(item, "结束日期")
  })).filter((item) => item.name || item.role || item.description || item.startTime || item.endTime);
  const honors = rows(doc, "award").map((item) => ({
    name: cell(item, "奖项名称"),
    time: cell(item, "获奖时间"),
    level: cell(item, "奖项级别"),
    issuer: cell(item, "颁奖单位"),
    description: plain(cell(item, "奖项描述"))
  })).filter((item) => item.name || item.time || item.level || item.issuer || item.description);
  const campusExperience = rows(doc, "campus").map((item) => ({
    name: cell(item, "经历名称") || cell(item, "活动名称"),
    role: cell(item, "担任角色"),
    section: cell(item, "组织名称"),
    description: plain(cell(item, "工作内容") || cell(item, "活动描述")),
    startTime: cell(item, "开始日期"),
    endTime: cell(item, "结束日期")
  })).filter((item) => item.name || item.role || item.description || item.startTime || item.endTime);
  const portfolio = rows(doc, "portfolio").map((item) => ({
    name: cell(item, "作品名称"),
    url: cell(item, "作品链接"),
    description: plain(cell(item, "作品描述"))
  })).filter((item) => item.name || item.url || item.description);
  const skills = [
    ...rows(doc, "computer").map((item) => cell(item, "技能名称")).filter(Boolean),
    ...rows(doc, "certificate").map((item) => cell(item, "证书名称")).filter(Boolean)
  ];
  const languages = [
    ...rows(doc, "english").map((item) => cell(item, "水平")).filter(Boolean),
    ...rows(doc, "language").map((item) => cell(item, "语种")).filter(Boolean)
  ];
  return {
    basic: {
      name: cell(basic, "姓名"),
      phone: cell(basic, "手机号"),
      email: cell(basic, "邮箱"),
      gender: cell(basic, "性别"),
      currentCity: cell(basic, "当前所在地"),
      targetCity: cell(intent, "期望城市"),
      currentStatus: cell(basic, "工作经验") || cell(basic, "工作年限"),
      targetSalary: cell(intent, "期望薪资"),
      wechat: cell(basic, "微信号"),
      targetPosition: cell(intent, "期望职位"),
      height: cell(basic, "身高"),
      weight: cell(basic, "体重"),
      nation: cell(basic, "民族"),
      nativePlace: cell(basic, "籍贯"),
      politicalOutlook: cell(basic, "政治面貌"),
      maritalStatus: cell(basic, "婚姻状况")
    },
    education,
    workExperience,
    projectExperience,
    awards: honors.map((item) => item.name).filter(Boolean),
    honors,
    campusExperience,
    portfolio,
    skills,
    skillsText: skills.join("\n"),
    languages,
    selfIntroduction: plain(cell(row(doc, "intro"), "自我介绍"))
  };
}

function emptyProfile(): ResumeProfile {
  return { basic: { name: "", phone: "", email: "" }, education: [], workExperience: [], skills: [], languages: [] };
}

function activeResume(workspace: { active: string; resumes: JisuDoc[] }) {
  return workspace.resumes.find((item) => stringValue(item.id) === workspace.active) ?? workspace.resumes[0];
}

function unwrapContent(payload: unknown): unknown {
  if (typeof payload === "string") return parseJson(payload);
  const record = asRecord(payload);
  if ("content" in record) return unwrapContent(record.content);
  if ("data" in record && record.data && typeof record.data === "object") return unwrapContent(record.data);
  return payload;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isJisuDoc(value: LooseRecord): value is JisuDoc {
  return Boolean(value.data && typeof value.data === "object");
}

function jisuDoc(payload: unknown): JisuDoc | undefined {
  const record = asRecord(payload);
  return isJisuDoc(record) ? record : undefined;
}

function rows(doc: JisuDoc, section: string) {
  const value = doc.data?.[section];
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function row(doc: JisuDoc, section: string) {
  return rows(doc, section)[0] ?? {};
}

function cell(record: JisuRecord, label: string) {
  return stringValue(record[label]).trim();
}

function plain(value: string) {
  return richTextToPlain(value);
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as LooseRecord : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
