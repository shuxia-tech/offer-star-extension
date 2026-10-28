import { describe, expect, it } from "vitest";
import { decideAutofillResume, normalizeFillMode, resolvePreferredResumeId } from "../src/shared/panel-preferences";

describe("悬浮面板偏好设置", () => {
  const resumes = [{ id: "r1", title: "简历一" }, { id: "r2", title: "简历二" }];

  it("优先恢复用户上次选择的简历", () => {
    expect(resolvePreferredResumeId(resumes, "r2")).toBe("r2");
    expect(resolvePreferredResumeId(resumes, "已删除")).toBe("r1");
    expect(resolvePreferredResumeId(resumes, undefined)).toBe("r1");
    expect(resolvePreferredResumeId([], "r1")).toBe("");
  });

  it("有简历时自动填充不要求再确认，没有简历才去预览", () => {
    expect(decideAutofillResume(resumes, "", false)).toEqual({ type: "ready", resumeId: "r1", reload: true });
    expect(decideAutofillResume(resumes, "r2", true)).toEqual({ type: "ready", resumeId: "r2", reload: false });
    expect(decideAutofillResume([], "r1", false)).toEqual({ type: "missing" });
  });

  it("只接受两个合法填写模式", () => {
    expect(normalizeFillMode("overwrite")).toBe("overwrite");
    expect(normalizeFillMode("unknown")).toBe("incremental");
    expect(normalizeFillMode(undefined)).toBe("incremental");
  });
});
