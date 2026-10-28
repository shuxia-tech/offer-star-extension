import type { ResumeSummary } from "./messages";

export type FillMode = "incremental" | "overwrite";

/** 从当前账号的简历列表中选择上次使用的简历，不存在时回退到第一份。 */
export function resolvePreferredResumeId(resumes: ResumeSummary[], savedId?: string) {
  return resumes.find((resume) => resume.id === savedId)?.id ?? resumes[0]?.id ?? "";
}

/** 自动填充直接使用已选简历或第一份；列表为空时才需要打开简历预览。 */
export function decideAutofillResume(resumes: ResumeSummary[], selectedId: string, profileReady: boolean) {
  const resumeId = resolvePreferredResumeId(resumes, selectedId);
  if (!resumeId) return { type: "missing" as const };
  return { type: "ready" as const, resumeId, reload: !profileReady || selectedId !== resumeId };
}

export function normalizeFillMode(value: unknown): FillMode {
  return value === "overwrite" ? "overwrite" : "incremental";
}
