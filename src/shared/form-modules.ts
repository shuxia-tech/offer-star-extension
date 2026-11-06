import type { FieldKey } from "./messages";

export type FormModuleKind = "project" | "education" | "work";

/** 模块内的字段。date 表示这一格是起止时间，由年月下拉填写，不单独当成一个文本字段。 */
export type ModuleFieldKey = FieldKey | "date";

export function moduleKindFromNavId(navId: string): FormModuleKind | "" {
  if (/project/i.test(navId)) return "project";
  if (/educat|school/i.test(navId)) return "education";
  if (/intern|work|practice/i.test(navId)) return "work";
  return "";
}

export function moduleKindFromTitle(title: string): FormModuleKind | "" {
  const text = title.replace(/\s+/g, "");
  if (/项目经验|项目经历/.test(text)) return "project";
  if (/教育背景|教育经历|教育经验/.test(text)) return "education";
  if (/实习经历|工作经历|实习经验|工作经验/.test(text)) return "work";
  return "";
}

/** 只在已知模块里解释字段标题。认不出的标题返回 null，交给全页匹配。 */
export function moduleFieldKey(kind: FormModuleKind, title: string): ModuleFieldKey | null {
  const text = title.replace(/[\s*＊:：]/g, "");
  if (kind === "project") {
    if (/^起止时间$|^项目时间$/.test(text)) return "date";
    if (text === "项目名称") return "projectName";
    if (/项目中的?职责/.test(text)) return "projectDescription";
    if (text === "职责" || text === "项目职责" || text === "担任角色" || text === "项目角色") return "projectRole";
    if (text === "项目描述" || text === "项目内容" || text === "项目介绍") return "projectDescription";
    return null;
  }
  if (kind === "education") {
    if (/^起止时间$|^就读时间$|^在校时间$/.test(text)) return "date";
    if (text === "学校名称" || text === "就读学校" || text === "学校") return "school";
    if (text === "专业名称" || text === "专业") return "major";
    if (text === "学历" || text === "学位") return "degree";
    return null;
  }
  if (/^起止时间$|^实习时间$|^工作时间$/.test(text)) return "date";
  if (text === "公司名称" || text === "公司") return "company";
  if (text === "职位名称" || text === "职位") return "position";
  if (text === "工作职责" || text === "工作内容") return "description";
  return null;
}
