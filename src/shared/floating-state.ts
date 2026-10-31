export type FloatingFillState = "idle" | "loading" | "scanning" | "filling" | "success" | "empty" | "missing" | "login" | "error" | "blocked";

export const floatingFillLabels: Record<FloatingFillState, string> = {
  idle: "一键填写", loading: "正在读取简历…", scanning: "正在识别表单…", filling: "正在填写…",
  success: "填写完成，请核对", empty: "暂无可填写内容", missing: "还没有可用简历", login: "请先登录账号",
  error: "填写未完成，请重试", blocked: "请先完成页面验证"
};

export function isFloatingFillState(value: unknown): value is FloatingFillState {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(floatingFillLabels, value);
}

export function isFloatingFillBusy(state: FloatingFillState) {
  return state === "loading" || state === "scanning" || state === "filling";
}

/** 窗口缩小或拖动到边缘时，保留整个控件和拖动区域。 */
export function clampFloatingPosition(x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  return { x: Math.min(Math.max(0, viewportWidth - width), Math.max(0, x)), y: Math.min(Math.max(0, viewportHeight - height), Math.max(0, y)) };
}
