import type { ResumeProfile, ResumeSummary } from "./messages";

/** 退出扩展登录后清理悬浮面板中与账号关联的状态，避免旧简历继续显示。 */
export function clearResumeSessionState() {
  return {
    resumes: [] as ResumeSummary[],
    selectedResumeId: "",
    resume: null as ResumeProfile | null
  };
}

/** 账号退出时需要同时移除的悬浮面板偏好键。 */
export const RESUME_SESSION_STORAGE_KEYS = ["extensionToken", "selectedResumeId", "fillMode"] as const;

/** 只有服务端明确返回未授权时才清理本地登录状态，避免网络错误导致用户被迫重新登录。 */
export function shouldClearExtensionToken(status: number) {
  return status === 401;
}

/** 未登录状态不重复重置提示，只在已登录授权消失时执行轮询兜底清理。 */
export function shouldResetSessionOnPoll(authState: "checking" | "signed-out" | "signed-in", hasToken: boolean) {
  return authState === "signed-in" && !hasToken;
}
