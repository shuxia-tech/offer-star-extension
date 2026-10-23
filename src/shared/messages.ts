export type FieldKey =
  | "name"
  | "phone"
  | "email"
  | "city"
  | "targetCity"
  | "age"
  | "gender"
  | "currentStatus"
  | "targetSalary"
  | "wechat"
  | "website"
  | "github"
  | "targetPosition"
  | "school"
  | "major"
  | "degree"
  | "company"
  | "position"
  | "startDate"
  | "endDate"
  | "description"
  | "skills"
  | "projectName"
  | "projectRole"
  | "projectStartDate"
  | "projectEndDate"
  | "projectDescription"
  | "photo"
  | "attachment";

/** 表单填写值；数组用于按页面出现顺序填写重复表单区块。 */
export type FieldValue = string | string[];

/** 上传给页面文件控件的文件数据。仅在用户明确选择并确认后发送。 */
export type FilePayload = { dataUrl: string; fileName: string; mimeType: string };

export type DetectedField = {
  id: string;
  key: FieldKey | null;
  label: string;
  type: string;
  elementIndex: number;
  confidence: number;
};

export type ResumeProfile = {
  basic: {
    name: string;
    phone: string;
    email: string;
    currentCity?: string;
    targetCity?: string;
    age?: string;
    gender?: string;
    currentStatus?: string;
    targetSalary?: string;
    wechat?: string;
    website?: string;
    github?: string;
    targetPosition?: string;
  };
  education: Array<{ school: string; major?: string; degree?: string }>;
  workExperience: Array<{ company: string; position?: string; description?: string; startTime?: string; endTime?: string }>;
  projectExperience?: Array<{ name: string; role?: string; description?: string; startTime?: string; endTime?: string }>;
  skills: string[];
  selfIntroduction?: string;
};

export type ResumeSummary = {
  id: string;
  title: string;
  previewImage?: string;
  updateTime?: string;
};

export type UserProfile = {
  nickname: string;
  avatar?: string;
};

export type AiAnalysisResult = {
  mappings: Array<{ fieldId: string; key: FieldKey | null; confidence: number; reason: string }>;
  drafts: Array<{ fieldKey: FieldKey; content: string; reason: string }>;
};

export type ExtensionMessage =
  | { type: "OPEN_FLOATING_PANEL" }
  | { type: "OPEN_OFFER_STAR_LOGIN" }
  | { type: "OPEN_OFFER_STAR_RESUME" }
  | { type: "GET_CURRENT_TAB_ID" }
  | { type: "SCAN_PAGE" }
  | { type: "FILL_FIELDS"; values: Record<string, FieldValue>; mode: "incremental" | "overwrite" }
  | { type: "UNDO_FILL" }
  | { type: "ADVANCE_FORM_STEP" }
  | { type: "FILL_PHOTO"; dataUrl: string; fileName: string; mimeType: string }
  | { type: "FILL_FILES"; files: FilePayload[] }
  | { type: "GET_PAGE_CONTEXT" }
  | { type: "PAGE_CONTEXT_CHANGED"; url: string; reason: string; tabId?: number }
  | { type: "PAGE_FORM_CHANGED"; url: string; tabId?: number }
  | { type: "SYNC_OFFER_STAR_TOKEN"; token: string | null; closeLoginWindow?: boolean }
  | { type: "RECONNECT_OFFER_STAR_LOGIN" }
  | { type: "CLEAR_EXTENSION_TOKEN" }
  | { type: "PAGE_FIELDS_DETECTED"; fields: DetectedField[] }
  | { type: "GET_RESUME_LIST" }
  | { type: "GET_RESUME_PROFILE"; resumeId: string }
  | { type: "GET_USER_PROFILE" }
  | { type: "ANALYZE_PAGE_WITH_AI"; pageUrl: string; siteId: string; jobDescription: string; fields: DetectedField[]; resume?: Pick<ResumeProfile, "skills" | "selfIntroduction">; draftInstruction?: string };
