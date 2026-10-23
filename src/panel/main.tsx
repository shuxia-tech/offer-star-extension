import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AiAnalysisResult, DetectedField, FieldKey, FilePayload, ResumeProfile, ResumeSummary, UserProfile } from "../shared/messages";
import { browser } from "wxt/browser";
import { getSiteAdapter } from "../shared/site-adapters";
import { applyAiMappings, applyManualFieldConfirmation, filterValuesByConfidence } from "../shared/ai-mapping";
import { buildResumeFieldValues } from "../shared/fill-values";
import { draftOverridesFromResult, rejectDraft } from "../shared/draft-state";
import { FORM_UPDATED_NOTICE, LOGIN_FORM_NOTICE_SUPPRESS_MS, formNoticeAfterLogin, getStalePageMessage, shouldSuppressFormNotice } from "./page-guards";
import { shouldAcceptPageChangeForPanel, shouldReportPageChange } from "../shared/page-change-routing";
import { clearResumeSessionState, shouldResetSessionOnPoll } from "../shared/auth-session";
import { buildFillPreview } from "../shared/fill-preview";
import { normalizeFillMode, resolvePreferredResumeId, type FillMode } from "../shared/panel-preferences";
import { isSensitiveFieldLabel } from "../shared/field-matching";
import { getPageContextChangedMessage } from "../shared/page-context-state";
import { formatSiteMetric, recordSiteFillMetric, type SiteMetric, type SiteMetrics } from "../shared/site-metrics";
import { buildFailureReport, stringifyFailureReport, type FailureReport } from "../shared/failure-report";
import { applySavedFieldOverrides, saveFieldOverride, type SiteFieldOverrides } from "../shared/site-field-overrides";
import { canQuickFill } from "../shared/quick-fill";
import { canApplyAiResult } from "../shared/ai-result-guard";
import { describeAttachment, removeAttachmentAt } from "../shared/attachment-preview";
import { aiConfidenceLevel, formatAiConfidence } from "../shared/ai-display";
import { nextResumeIndex } from "../shared/resume-menu";
import { hasExtensionTokenChange } from "../shared/storage-change";
import { buildAiRequestBody, sanitizePageUrl, sanitizeText } from "../shared/privacy";
import { withRequestTimeout } from "../shared/request-timeout";
import "./styles.css";

/** 将浏览器消息异常转换为用户可以直接采取行动的中文提示。 */
function formatPageOperationError(error: unknown, operation: string) {
  const detail = error instanceof Error ? error.message : String(error ?? "未知错误");
  if (/Receiving end does not exist|Could not establish connection|message port closed/i.test(detail)) {
    return `当前页面还没有加载 Offer Star 助手，请刷新页面后重新${operation}`;
  }
  if (/Cannot access|not allowed|extensions gallery|chrome:\/\/|edge:\/\/|about:/i.test(detail)) {
    return `当前浏览器页面不允许${operation}，请打开普通网页申请表单后重试`;
  }
  return `${operation}失败：${detail}`;
}

/** 只展示站点和路径，避免把查询参数中的个人信息带进面板或日志。 */
function formatPageAddress(url: string) {
  try {
    const parsed = new URL(sanitizePageUrl(url));
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return "当前页面";
  }
}

type PanelIconName = "document" | "external" | "upload" | "sparkle";

/** 使用内嵌 SVG 保持 Chrome、Edge、Firefox 的图标渲染一致，不依赖外部字体。 */
function PanelIcon({ name, className = "" }: { name: PanelIconName; className?: string }) {
  const paths: Record<PanelIconName, React.ReactNode> = {
    document: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    external: <><path d="M13 5h6v6" /><path d="m19 5-8 8" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
    sparkle: <><path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z" /><path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" /></>
  };
  return <svg className={`panel-icon ${className}`} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function App() {
  const embedded = new URLSearchParams(window.location.search).get("embedded") === "1";
  const fallbackTabId = Number(new URLSearchParams(window.location.search).get("tabId"));
  const [fields, setFields] = useState<DetectedField[]>([]);
  const [phase, setPhase] = useState<"ready" | "scanning" | "review" | "confirm" | "filling" | "done">("ready");
  const [fillMode, setFillMode] = useState<"incremental" | "overwrite">("incremental");
  const [message, setMessage] = useState("打开申请页面后，先扫描当前页面");
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [authState, setAuthState] = useState<"checking" | "signed-out" | "signed-in">("checking");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const authStateRef = useRef(authState);
  const resumeListRequestRef = useRef(0);
  const resumeProfileRequestRef = useRef(0);
  const [loginPending, setLoginPending] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [resumeMenuOpen, setResumeMenuOpen] = useState(false);
  const [resumeFocusIndex, setResumeFocusIndex] = useState(0);
  const [resume, setResume] = useState<ResumeProfile | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, string>>({});
  const [photoData, setPhotoData] = useState<FilePayload[]>([]);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [siteMetric, setSiteMetric] = useState<SiteMetric | undefined>();
  const [siteName, setSiteName] = useState("");
  const [siteIsGeneric, setSiteIsGeneric] = useState(false);
  const [pageTitle, setPageTitle] = useState("");
  const [pageAddress, setPageAddress] = useState("");
  const [failureReport, setFailureReport] = useState<FailureReport | undefined>();
  const [securityBlocked, setSecurityBlocked] = useState(false);
  const photoDataRef = useRef<FilePayload[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resumePickerRef = useRef<HTMLDivElement | null>(null);
  const pageRevisionRef = useRef(0);
  const messageRef = useRef(message);
  const suppressFormNoticeUntilRef = useRef(0);
  const aiRequestRef = useRef(0);
  const [pageStale, setPageStale] = useState(false);
  const fieldOptions: Array<[FieldKey, string]> = [
    ["name", "姓名"], ["phone", "手机号"], ["email", "邮箱"], ["city", "城市"], ["targetCity", "期望城市"],
    ["age", "年龄"], ["gender", "性别"], ["currentStatus", "求职状态"], ["targetSalary", "期望薪资"], ["wechat", "微信"],
    ["website", "个人网站"], ["github", "GitHub"], ["targetPosition", "目标职位"], ["school", "学校"], ["major", "专业"],
    ["degree", "学历"], ["company", "公司"], ["position", "职位"], ["startDate", "开始日期"], ["endDate", "结束日期"],
    ["description", "工作/自我介绍"], ["skills", "技能"], ["projectName", "项目名称"], ["projectRole", "项目角色"],
    ["projectStartDate", "项目开始时间"], ["projectEndDate", "项目结束时间"], ["projectDescription", "项目描述"]
  ];

  useEffect(() => {
    photoDataRef.current = photoData;
  }, [photoData]);

  useEffect(() => {
    authStateRef.current = authState;
  }, [authState]);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  useEffect(() => {
    if (!resumeMenuOpen) return;
    const closeWhenOutside = (event: PointerEvent) => {
      if (!resumePickerRef.current?.contains(event.target as Node)) setResumeMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setResumeMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [resumeMenuOpen]);

  useEffect(() => {
    if (!resumeMenuOpen) return;
    resumePickerRef.current?.querySelector<HTMLElement>(`[data-resume-option-index="${resumeFocusIndex}"]`)?.focus();
  }, [resumeMenuOpen, resumeFocusIndex]);

  async function getTargetTab() {
    if (Number.isInteger(fallbackTabId) && fallbackTabId > 0) {
      try {
        return await browser.tabs.get(fallbackTabId);
      } catch (error) {
        console.warn("[Offer Star][FloatingPanel] 回退目标标签页不可用，改用当前活动页", error);
      }
    }
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  useEffect(() => {
    void loadResumeList();
    const resetSignedOutSession = () => {
      resumeListRequestRef.current += 1;
      resumeProfileRequestRef.current += 1;
      authStateRef.current = "signed-out";
      setAuthState("signed-out");
      setResumes([]);
      setUserProfile(null);
      setAvatarFailed(false);
      setSelectedResumeId("");
      setResume(null);
      setAiResult(null);
      setDraftOverrides({});
      setMessage("请先登录并创建简历");
    };
    const dismissFormNoticeAfterLogin = () => {
      suppressFormNoticeUntilRef.current = Date.now() + LOGIN_FORM_NOTICE_SUPPRESS_MS;
      setPageStale(false);
      const nextMessage = formNoticeAfterLogin(messageRef.current);
      if (nextMessage) setMessage(nextMessage);
    };
    const onStorageChanged = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (!hasExtensionTokenChange(changes, areaName)) return;
      const signedIn = Boolean(changes.extensionToken?.newValue);
      console.info("[Offer Star][FloatingPanel] 检测到官网登录状态变化，自动刷新简历列表", { 已登录: signedIn });
      if (!signedIn) {
        resetSignedOutSession();
        return;
      }
      dismissFormNoticeAfterLogin();
      void loadResumeList();
    };
    // 某些浏览器版本不会把后台页的 storage 变化转发给扩展 iframe，轮询只读取 token 是否存在，不触碰用户数据。
    const sessionCheckTimer = window.setInterval(() => {
      void browser.storage.local.get("extensionToken").then((stored) => {
        if (shouldResetSessionOnPoll(authStateRef.current, Boolean(stored.extensionToken))) resetSignedOutSession();
        else if (stored.extensionToken && authStateRef.current === "signed-out") {
          dismissFormNoticeAfterLogin();
          void loadResumeList();
        }
      }).catch((error) => console.warn("[Offer Star][FloatingPanel] 登录状态轮询失败", error));
    }, 1000);
    const onPageChanged = (message: { type?: string; url?: string; tabId?: number }) => {
      if (message.url && !shouldReportPageChange(message.url)) return;
      if (!shouldAcceptPageChangeForPanel(fallbackTabId, message.tabId)) return;
      if (message.type === "PAGE_FORM_CHANGED") {
        if (shouldSuppressFormNotice(suppressFormNoticeUntilRef.current, Date.now())) return;
        pageRevisionRef.current += 1;
        setPageStale(true);
        setMessage(FORM_UPDATED_NOTICE);
        console.info("[Offer Star][FloatingPanel] 表单结构已更新", { 地址: sanitizePageUrl(message.url) });
        return;
      }
      if (message.type !== "PAGE_CONTEXT_CHANGED") return;
      pageRevisionRef.current += 1;
      const hadPendingAttachments = photoDataRef.current.length > 0;
      setFields([]);
      setAiResult(null);
      setDraftOverrides({});
      setPhotoData([]);
      setSiteMetric(undefined);
      setSiteName("");
      setSiteIsGeneric(false);
      setPageTitle("");
      setPageAddress("");
      setFailureReport(undefined);
      setSecurityBlocked(false);
      setPageStale(false);
      setPhase("ready");
      setMessage(getPageContextChangedMessage(hadPendingAttachments));
      console.info("[Offer Star][FloatingPanel] 页面上下文已失效", { 地址: sanitizePageUrl(message.url) });
    };
    browser.runtime.onMessage.addListener(onPageChanged);
    browser.storage.onChanged.addListener(onStorageChanged);
    return () => {
      window.clearInterval(sessionCheckTimer);
      browser.runtime.onMessage.removeListener(onPageChanged);
      browser.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  async function refreshWebsiteLogin() {
    authStateRef.current = "checking";
    setAuthState("checking");
    setMessage("正在重新连接官网登录状态…");
    try {
      const result = await withRequestTimeout(
        browser.runtime.sendMessage({ type: "RECONNECT_OFFER_STAR_LOGIN" }), 10000,
        "官网登录同步超时，请刷新官网后重试"
      );
      if (!result?.success) throw new Error(result?.error ?? "官网登录同步失败");
      await loadResumeList();
    } catch (error) {
      authStateRef.current = "signed-out";
      setAuthState("signed-out");
      setMessage(error instanceof Error ? error.message : "官网登录同步失败");
    }
  }

  async function loadResumeList() {
    const requestId = ++resumeListRequestRef.current;
    authStateRef.current = "checking";
    setAuthState("checking");
    setUserProfile(null);
    setAvatarFailed(false);
    console.info("[Offer Star][FloatingPanel] 开始加载简历列表");
    let hasStoredSession = false;
    try {
      const storedSession = await withRequestTimeout(browser.storage.local.get("extensionToken"), 3000, "无法读取扩展登录状态，请刷新页面后重试");
      if (requestId !== resumeListRequestRef.current) return;
      hasStoredSession = Boolean(storedSession.extensionToken);
      if (!hasStoredSession) {
        setAuthState("signed-out");
        setResumes([]);
        setUserProfile(null);
        setSelectedResumeId("");
        setResume(null);
        setMessage("请先登录并创建简历");
        return;
      }
      const result = await withRequestTimeout(browser.runtime.sendMessage({ type: "GET_RESUME_LIST" }), 15000, "后台登录检查超时，请刷新页面后重试");
      if (requestId !== resumeListRequestRef.current) return;
      if (result?.error) throw new Error(result.error);
      if (!Array.isArray(result)) throw new Error("后台未返回有效简历列表，请刷新页面后重试");
      const list = result as ResumeSummary[];
      setAuthState("signed-in");
      setResumes(list);
      void withRequestTimeout(browser.runtime.sendMessage({ type: "GET_USER_PROFILE" }), 10000, "用户资料加载超时")
        .then((profileResult) => {
          if (requestId !== resumeListRequestRef.current || profileResult?.error) return;
          setUserProfile(profileResult as UserProfile);
          setAvatarFailed(false);
        })
        .catch((error) => console.warn("[Offer Star][FloatingPanel] 用户资料暂未加载", error));
      const preferences = await browser.storage.local.get(["selectedResumeId", "fillMode"]);
      if (requestId !== resumeListRequestRef.current) return;
      setFillMode(normalizeFillMode(preferences.fillMode));
      const preferredId = resolvePreferredResumeId(list, typeof preferences.selectedResumeId === "string" ? preferences.selectedResumeId : undefined);
      if (preferredId) {
        setSelectedResumeId(preferredId);
        await browser.storage.local.set({ selectedResumeId: preferredId });
        await loadResumeProfile(preferredId);
      } else {
        setMessage("还没有可用简历，请先在 Offer Star 创建一份简历");
      }
    } catch (error) {
      if (requestId !== resumeListRequestRef.current) return;
      console.error("[Offer Star][FloatingPanel] 简历列表加载失败", error);
      const latestSession = await withRequestTimeout(browser.storage.local.get("extensionToken"), 3000, "无法读取登录状态").catch(() => ({} as { extensionToken?: unknown }));
      if (requestId !== resumeListRequestRef.current) return;
      if (hasStoredSession && latestSession.extensionToken) {
        setAuthState("signed-in");
        setMessage(error instanceof Error ? error.message : "简历加载失败，请稍后重试");
      } else {
        setAuthState("signed-out");
        setResumes([]);
        setUserProfile(null);
        setSelectedResumeId("");
        setResume(null);
        setAiResult(null);
        setDraftOverrides({});
        setMessage(error instanceof Error ? error.message : "登录检查失败，请刷新页面后重试");
      }
    }
  }

  async function clearExtensionToken() {
    const result = await browser.runtime.sendMessage({ type: "CLEAR_EXTENSION_TOKEN" });
    if (!result?.success) {
      setMessage(result?.error ?? "退出登录失败");
      return;
    }
    const cleared = clearResumeSessionState();
    setResumes(cleared.resumes);
    setUserProfile(null);
    setAvatarFailed(false);
    setAuthState("signed-out");
    setResume(cleared.resume);
    setSelectedResumeId(cleared.selectedResumeId);
    setMessage("已退出扩展登录，请重新登录 Offer Star");
    console.info("[Offer Star][FloatingPanel] 用户退出扩展登录");
  }

  async function openOfferStarLogin() {
    if (loginPending) return;
    console.info("[Offer Star][FloatingPanel] 用户点击打开官网登录");
    setLoginPending(true);
    try {
      // Firefox 某些版本在后台页尚未完成启动时可能让消息一直等待；超时后给出可操作提示，避免按钮看起来无响应。
      const result = await Promise.race([
        browser.runtime.sendMessage({ type: "OPEN_OFFER_STAR_LOGIN" }),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("后台打开登录窗口超时，请刷新当前页面后重试")), 8000))
      ]);
      if (!result?.success) throw new Error(result?.error ?? "无法打开登录窗口");
      setMessage("已打开微信扫码窗口，登录成功后会自动关闭并刷新");
      console.info("[Offer Star][FloatingPanel] 登录窗口打开成功", { 窗口: result.windowId });
    } catch (error) {
      console.error("[Offer Star][FloatingPanel] 打开官网登录失败", error);
      setMessage(error instanceof Error ? error.message : "无法打开微信扫码窗口，请手动打开官网");
    } finally {
      setLoginPending(false);
    }
  }

  async function openOfferStarResume() {
    console.info("[Offer Star][FloatingPanel] 用户点击管理简历");
    try {
      const result = await browser.runtime.sendMessage({ type: "OPEN_OFFER_STAR_RESUME" });
      if (!result?.success) throw new Error(result?.error ?? "无法打开简历管理页");
      setMessage("已打开简历管理页，可在新标签页查看和修改简历");
    } catch (error) {
      console.error("[Offer Star][FloatingPanel] 打开简历管理页失败", error);
      setMessage(error instanceof Error ? error.message : "无法打开简历管理页，请手动打开高分简历");
    }
  }

  function changeFillMode(mode: FillMode) {
    setFillMode(mode);
    void browser.storage.local.set({ fillMode: mode });
  }

  async function loadResumeProfile(resumeId: string) {
    const requestId = ++resumeProfileRequestRef.current;
    setSelectedResumeId(resumeId);
    await browser.storage.local.set({ selectedResumeId: resumeId });
    setResume(null);
    setResumeMenuOpen(false);
    setResumeFocusIndex(0);
    try {
      const result = await withRequestTimeout(browser.runtime.sendMessage({ type: "GET_RESUME_PROFILE", resumeId }), 15000, "简历内容加载超时，请重新选择简历");
      if (requestId !== resumeProfileRequestRef.current) return;
      if (result?.error) throw new Error(result.error);
      setResume(result as ResumeProfile);
      console.info("[Offer Star][FloatingPanel] 当前简历加载成功", { 简历编号: resumeId });
    } catch (error) {
      if (requestId !== resumeProfileRequestRef.current) return;
      console.error("[Offer Star][FloatingPanel] 当前简历加载失败", error);
      setMessage(error instanceof Error ? error.message : "简历内容加载失败");
    }
  }

  async function scanPage() {
    console.info("[Offer Star][FloatingPanel] 用户点击扫描");
    pageRevisionRef.current += 1;
    setPhase("scanning");
    setSecurityBlocked(false);
    setMessage("正在识别页面字段…");
    try {
      const tab = await getTargetTab();
      if (!tab.id) { setPhase("ready"); setMessage("无法访问当前页面"); return; }
      const result = await browser.tabs.sendMessage(tab.id, { type: "SCAN_PAGE" });
      const context = await browser.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" }).catch(() => null);
      const adapter = getSiteAdapter(tab.url ?? "");
      const siteId = adapter.id;
      setSiteName(adapter.name);
      setSiteIsGeneric(adapter.id === "generic");
      setPageTitle(context?.pageTitle || tab.title || "当前申请页面");
      setPageAddress(formatPageAddress(context?.pageUrl || tab.url || ""));
      const metricStore = await browser.storage.local.get(["siteMetrics", "siteFieldOverrides"]);
      setSiteMetric((metricStore.siteMetrics as SiteMetrics | undefined)?.[siteId]);
      setAiResult(null);
      setDraftOverrides({});
      setPhotoData([]);
      const savedOverrides = (metricStore.siteFieldOverrides ?? {}) as SiteFieldOverrides;
      setFields(applySavedFieldOverrides(result?.fields ?? [], siteId, savedOverrides));
      setPageStale(false);
      if (result?.blockedReason) {
        setFields([]);
        setPhase("ready");
        setSecurityBlocked(true);
        setMessage(result.blockedReason);
        console.warn("[Offer Star][FloatingPanel] 页面需要先完成安全验证", { 站点: adapter.name });
        return;
      }
      if (!jobDescription.trim() && context?.jobDescription) setJobDescription(context.jobDescription);
      setPhase("review");
      setMessage(`识别到 ${result?.fields?.length ?? 0} 个字段${context?.pageTitle ? `，页面：${context.pageTitle}` : ""}，请确认后填写`);
      console.info("[Offer Star][FloatingPanel] 扫描结果", { 字段数量: result?.fields?.length ?? 0 });
    } catch (error) {
      setPhase("ready");
      setMessage(formatPageOperationError(error, "扫描"));
      console.error("[Offer Star][FloatingPanel] 页面扫描失败", error);
    }
  }

  async function confirmField(field: DetectedField, key: FieldKey | null) {
    setFields((current) => applyManualFieldConfirmation(current, field.id, key));
    try {
      const tab = await getTargetTab();
      const siteId = getSiteAdapter(tab.url ?? "").id;
      const stored = await browser.storage.local.get("siteFieldOverrides");
      const next = saveFieldOverride((stored.siteFieldOverrides ?? {}) as SiteFieldOverrides, siteId, field.label, key);
      await browser.storage.local.set({ siteFieldOverrides: next });
      console.info("[Offer Star][FloatingPanel] 已保存站点字段映射", { 站点: siteId, 字段: sanitizeText(field.label), 类型: key ?? "已清除" });
    } catch (error) {
      console.error("[Offer Star][FloatingPanel] 保存站点字段映射失败", error);
      setMessage("字段已临时确认，但映射记忆保存失败，请稍后重试");
    }
  }

  async function fill() {
    console.info("[Offer Star][FloatingPanel] 用户点击填写");
    const staleMessage = getStalePageMessage(pageStale, "填写");
    if (staleMessage) { setMessage(staleMessage); return; }
    setPhase("filling");
    try {
      const tab = await getTargetTab();
      if (!tab.id) { setPhase("review"); setMessage("无法访问当前页面"); return; }
      if (!resume) { setPhase("review"); setMessage("请先选择一份简历"); return; }
      const values = filterValuesByConfidence(buildResumeFieldValues(resume, draftOverrides), fields);
      const result = await browser.tabs.sendMessage(tab.id, { type: "FILL_FIELDS", values, mode: fillMode });
      setPhase("done");
      const failed = (result?.failed ?? []) as string[];
      const failureReasons = (result?.failureReasons ?? {}) as Record<string, string>;
      const siteId = getSiteAdapter(tab.url ?? "").id;
      const metricStore = await browser.storage.local.get("siteMetrics");
      const nextMetrics = recordSiteFillMetric((metricStore.siteMetrics ?? {}) as SiteMetrics, siteId, result?.filled?.length ?? 0, failed.length);
      await browser.storage.local.set({ siteMetrics: nextMetrics });
      setSiteMetric(nextMetrics[siteId]);
      const report = failed.length ? buildFailureReport(siteId, tab.url ?? "", failed, failureReasons) : undefined;
      setFailureReport(report);
      if (report) await browser.storage.local.set({ latestFailureReport: report });
      else await browser.storage.local.remove("latestFailureReport");
      const failureText = failed.map((field) => `${field}（${failureReasons[field] ?? "未知原因"}）`).join("、");
      setMessage(`已填写 ${result?.filled?.length ?? 0} 个字段${failed.length ? `，${failed.length} 个字段失败：${failureText}` : ""}，请复核后提交`);
      console.info("[Offer Star][FloatingPanel] 填写结果", { 站点: siteId, 成功数量: result?.filled?.length ?? 0, 失败数量: failed.length, 失败字段: failed, 失败原因: failureReasons });
    } catch (error) {
      setPhase("review");
      setMessage(formatPageOperationError(error, "填写"));
      console.error("[Offer Star][FloatingPanel] 页面填写失败", error);
    }
  }

  async function undo() {
    console.info("[Offer Star][FloatingPanel] 用户点击撤销填写");
    const staleMessage = getStalePageMessage(pageStale, "撤销");
    if (staleMessage) { setMessage(staleMessage); return; }
    try {
      const tab = await getTargetTab();
      if (!tab.id) { setMessage("无法访问当前页面"); return; }
      const result = await browser.tabs.sendMessage(tab.id, { type: "UNDO_FILL" });
      setMessage(`已撤销 ${result?.restored?.length ?? 0} 个字段，请重新检查页面`);
      setPhase("review");
    } catch (error) {
      setMessage(formatPageOperationError(error, "撤销填写"));
      console.error("[Offer Star][FloatingPanel] 撤销填写失败", error);
    }
  }

  async function advanceStep() {
    console.info("[Offer Star][FloatingPanel] 用户点击填写下一步");
    const staleMessage = getStalePageMessage(pageStale, "点击下一步");
    if (staleMessage) { setMessage(staleMessage); return; }
    try {
      const tab = await getTargetTab();
      if (!tab.id) { setMessage("无法访问当前页面"); return; }
      const result = await browser.tabs.sendMessage(tab.id, { type: "ADVANCE_FORM_STEP" });
      if (!result?.advanced) {
        setMessage("没有找到安全的下一步按钮，请手动操作页面");
        return;
      }
      setMessage(`已点击“${result.label ?? "下一步"}”，正在重新扫描后续步骤`);
      await scanPage();
    } catch (error) {
      setMessage(formatPageOperationError(error, "填写下一步"));
      console.error("[Offer Star][FloatingPanel] 下一步操作失败", error);
    }
  }

  async function analyzeWithAi(draftInstruction = "", draftField?: FieldKey) {
    const tab = await getTargetTab();
    if (!tab.id || !tab.url) { setMessage("无法读取当前页面地址"); return; }
    const requestId = ++aiRequestRef.current;
    const requestRevision = pageRevisionRef.current;
    const requestedTabId = tab.id;
    const requestedUrl = tab.url;
    setAiPending(true);
    setMessage("AI 正在分析未识别字段…");
    try {
      const body = buildAiRequestBody({
        type: "ANALYZE_PAGE_WITH_AI",
        pageUrl: tab.url,
        siteId: getSiteAdapter(tab.url).id,
        jobDescription,
        fields,
        resume: resume ? { skills: resume.skills, selfIntroduction: resume.selfIntroduction } : undefined,
        draftInstruction
      });
      const result = await browser.runtime.sendMessage({ type: "ANALYZE_PAGE_WITH_AI", ...body });
      if (result?.error) throw new Error(result.error);
      const currentTab = await getTargetTab();
      if (!canApplyAiResult({
        requestId,
        activeRequestId: aiRequestRef.current,
        requestRevision,
        currentRevision: pageRevisionRef.current,
        requestedTabId,
        currentTabId: currentTab.id,
        requestedUrl,
        currentUrl: currentTab.url
      })) {
        console.warn("[Offer Star][FloatingPanel] 丢弃过期 AI 结果", { 请求编号: requestId });
        setMessage("页面在 AI 分析期间发生变化，请重新扫描后再分析");
        return;
      }
      const analysis = result as AiAnalysisResult;
      const mergedAnalysis = draftField && aiResult
        ? { ...analysis, drafts: [...analysis.drafts.filter((draft) => draft.fieldKey === draftField), ...aiResult.drafts.filter((draft) => draft.fieldKey !== draftField)] }
        : analysis;
      setAiResult(mergedAnalysis);
      setDraftOverrides((current) => draftField ? { ...current, ...draftOverridesFromResult(analysis) } : draftOverridesFromResult(analysis));
      setFields((current) => applyAiMappings(current, analysis));
      setMessage(`AI 已分析 ${analysis.mappings.length} 个字段，请确认映射后再填写`);
    } catch (error) {
      console.error("[Offer Star][FloatingPanel] AI 分析失败", error);
      setMessage(error instanceof Error ? error.message : "AI 分析失败");
    } finally {
      setAiPending(false);
    }
  }

  async function confirmPhoto() {
    if (!photoData.length) return;
    const staleMessage = getStalePageMessage(pageStale, "确认附件");
    if (staleMessage) { setMessage(staleMessage); return; }
    try {
      const tab = await getTargetTab();
      if (!tab.id) { setMessage("无法访问当前页面"); return; }
      const result = await browser.tabs.sendMessage(tab.id, { type: "FILL_FILES", files: photoData });
      const failed = Array.isArray(result?.failed) ? result.failed as string[] : [];
      if (!result?.filled) {
        setMessage("没有找到可用的附件上传控件，请检查页面是否已展开上传区域");
        return;
      }
      setMessage(`已写入 ${result.count ?? photoData.length} 个附件${failed.length ? `，未写入：${failed.join("、")}` : ""}，请检查后继续`);
      console.info("[Offer Star][FloatingPanel] 附件确认结果", { 成功数量: result.count ?? 0, 失败附件: failed });
    } catch (error) {
      setMessage(formatPageOperationError(error, "填写附件"));
      console.error("[Offer Star][FloatingPanel] 附件填写失败", error);
    }
  }

  async function copyFailureReport() {
    if (!failureReport) return;
    const text = stringifyFailureReport(failureReport);
    try {
      await navigator.clipboard.writeText(text);
      setMessage("诊断报告已复制，可直接提交给开发人员");
    } catch (error) {
      console.error("[Offer Star][FloatingPanel] 复制诊断报告失败", error);
      setMessage("浏览器禁止自动复制，请打开开发者工具查看日志");
    }
  }

  async function choosePhoto(fileList: FileList | undefined) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const allowed = (file: File) => file.type.startsWith("image/") || ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type) || /\.(pdf|docx?)$/i.test(file.name);
    if (files.some((file) => !allowed(file))) { setMessage("仅支持图片、PDF、DOC 和 DOCX 附件"); return; }
    if (files.some((file) => file.size > 6 * 1024 * 1024)) { setMessage("单个附件不能超过 6MB"); return; }
    const payloads = await Promise.all(files.map((file) => new Promise<FilePayload>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: String(reader.result), fileName: file.name, mimeType: file.type || "application/octet-stream" });
      reader.onerror = () => reject(reader.error ?? new Error("附件读取失败"));
      reader.readAsDataURL(file);
    })));
    photoDataRef.current = payloads;
    setPhotoData(payloads);
    setMessage(`已选择 ${payloads.length} 个附件，请点击确认填入`);
  }

  function removeSelectedAttachment(index: number) {
    const next = removeAttachmentAt(photoDataRef.current, index);
    photoDataRef.current = next;
    setPhotoData(next);
    setMessage(next.length ? `已保留 ${next.length} 个待确认附件` : "已清空待确认附件");
  }

  const matched = fields.filter((field) => field.key && field.confidence >= 0.7 && field.key !== "photo" && field.key !== "attachment");
  const pending = fields.filter((field) => !field.key || field.confidence < 0.7 || isSensitiveFieldLabel(field.label) || field.key === "photo" || field.key === "attachment");
  const previewValues = resume ? filterValuesByConfidence(buildResumeFieldValues(resume, draftOverrides), fields) : {};
  const fillPreview = buildFillPreview(fields, previewValues);
  const selectedResume = resumes.find((item) => item.id === selectedResumeId);
  const pageContextState = securityBlocked ? "security" : phase === "done" ? "done" : "pending";
  const pageContextLabel = securityBlocked ? "需验证" : phase === "done" ? "已填写" : "待填写";
  const userInitial = (userProfile?.nickname || "Offer Star").slice(0, 1).toUpperCase();

  const renderFieldRow = (field: DetectedField) => <li className="field-row" key={field.id}>
    <span className="field-row-copy">
      <strong>{field.label || "未命名字段"}</strong>
      <small>{field.key === "photo" ? "请选择照片" : field.key === "attachment" ? "请选择附件" : isSensitiveFieldLabel(field.label) ? "敏感问题，请手动填写" : field.confidence < 0.7 ? "需要确认对应的简历字段" : "已匹配，可自动填写"}</small>
    </span>
    {field.key !== "photo" && field.key !== "attachment" && !isSensitiveFieldLabel(field.label) && field.confidence < 0.7 ? <select className="field-confirm-select" aria-label={`确认${field.label || "字段"}`} value={field.key ?? ""} onChange={(event) => void confirmField(field, (event.target.value || null) as FieldKey | null)}>
      <option value="">选择对应字段</option>
      {fieldOptions.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
    </select> : null}
  </li>;

  return <main className="offer-star-panel">
    <header className="panel-header">
      <div className="brand-lockup"><div className="brand-mark">★</div><div><h2>Offer Star</h2><span>简历填写助手</span></div></div>
      {embedded ? <button className="panel-close-button" type="button" aria-label="关闭悬浮面板" onClick={() => window.parent.postMessage({ type: "OFFER_STAR_CLOSE_FLOATING_PANEL" }, "*")}>×</button> : null}
    </header>

    {authState === "signed-in" ? <section className="account-strip" aria-label="当前登录用户">
      {userProfile?.avatar && !avatarFailed ? <img className="account-avatar" src={userProfile.avatar} alt="" onError={() => setAvatarFailed(true)} /> : <span className="account-avatar account-avatar-fallback">{userInitial}</span>}
      <span className="account-copy"><strong>{userProfile?.nickname || "已登录 Offer Star"}</strong><small>账号已连接</small></span>
      <button className="account-action" type="button" onClick={() => void openOfferStarResume()}>管理简历</button>
      <button className="account-action account-logout" type="button" onClick={() => void clearExtensionToken()}>退出</button>
    </section> : null}

    <div className={`status-banner status-${phase}${securityBlocked ? " status-security" : ""}`} role="status" aria-live="polite" aria-atomic="true">{message}</div>

    {siteName ? <section className="page-context-card" aria-label="当前页面信息">
      <div className="page-context-icon"><PanelIcon name="external" /></div>
      <div className="page-context-copy"><strong>{siteName}{siteIsGeneric ? "（通用识别）" : ""}</strong><small>{pageTitle || pageAddress || "当前申请页面"}</small></div>
      <span className={`page-context-badge page-context-badge-${pageContextState}`}>{pageContextLabel}</span>
    </section> : null}

    <section className="resume-card" aria-busy={authState === "checking"}>
      <div className="section-heading"><strong>使用哪份简历</strong></div>
      {authState === "checking" ? <div className="resume-loading" role="status" aria-label="正在加载简历"><div className="loading-copy"><strong>正在读取简历</strong><span>请稍候</span></div><span className="loading-bar" /></div> : null}
      {authState === "checking" ? null : resumes.length ? <div className="resume-picker" ref={resumePickerRef}>
        <button type="button" className="resume-picker-trigger" aria-expanded={resumeMenuOpen} aria-haspopup="listbox" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setResumeMenuOpen(false); } else if (event.key === "ArrowDown") { event.preventDefault(); setResumeMenuOpen(true); setResumeFocusIndex(0); } else if (event.key === "ArrowUp") { event.preventDefault(); setResumeMenuOpen(true); setResumeFocusIndex(Math.max(0, resumes.length - 1)); } }} onClick={() => setResumeMenuOpen((open) => !open)}>
          <span className="resume-avatar">{(selectedResume?.title || "简").slice(0, 1)}</span>
          <span className="resume-picker-copy"><strong>{selectedResume?.title || "选择一份简历"}</strong><small>{resumes.length} 份简历可选</small></span>
          <span className="resume-chevron">{resumeMenuOpen ? "⌃" : "⌄"}</span>
        </button>
        {resumeMenuOpen ? <div className="resume-options" role="listbox" aria-label="简历列表">
          {resumes.map((item, index) => <button type="button" data-resume-option-index={index} role="option" aria-selected={item.id === selectedResumeId} className={`${item.id === selectedResumeId ? "resume-option option-active" : "resume-option"}${resumeFocusIndex === index ? " option-focused" : ""}`} key={item.id} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setResumeFocusIndex(nextResumeIndex(index, event.key === "ArrowDown" ? "next" : "previous", resumes.length)); } else if (event.key === "Escape") { event.preventDefault(); setResumeMenuOpen(false); } }} onClick={() => void loadResumeProfile(item.id)}><span className="resume-avatar small">{item.title.slice(0, 1)}</span><span>{item.title}</span>{item.id === selectedResumeId ? <span className="option-check">✓</span> : null}</button>)}
        </div> : null}
      </div> : <>
        <div className="resume-empty-state">请先登录并创建简历</div>
        <div className="login-actions">
          <button className="button-primary" disabled={loginPending} onClick={() => void openOfferStarLogin()}>{loginPending ? "正在打开…" : "微信扫码登录"}</button>
          <button onClick={() => void refreshWebsiteLogin()}>我已登录</button>
        </div>
      </>}
    </section>

    <section className={`action-card${fields.length ? " action-card-scanned" : ""}`}>
      {fields.length ? <div className="field-summary" aria-label="字段识别统计">
        <div><strong>{matched.length}</strong><span>项可自动填写</span></div>
        <p>{pending.length ? `${pending.length} 项需要确认` : `共识别 ${fields.length} 项，全部已匹配`}</p>
      </div> : <div className="action-intro"><strong>填写当前申请表</strong><span>扫描后只会填写，不会自动提交。</span></div>}
      <div className="primary-actions">
        <button className={fields.length ? "button-secondary" : "button-primary"} onClick={scanPage} disabled={phase === "scanning" || phase === "filling"}>
          {phase === "scanning" ? "正在扫描…" : fields.length ? "重新扫描" : "扫描当前页面"}
        </button>
        {fields.length ? <button className="button-primary" onClick={() => canQuickFill(fields, pageStale) ? void fill() : setPhase("confirm")} disabled={pageStale || !resume || phase === "scanning" || phase === "filling" || phase === "done"}>
          {canQuickFill(fields, pageStale) ? "一键填写" : "查看匹配结果"}
        </button> : null}
      </div>
    </section>

    {siteName && !fields.length && !securityBlocked && phase !== "scanning" ? <section className="empty-scan-card" aria-live="polite">
      <div className="empty-scan-copy"><strong>没有找到可填写字段</strong><span>请先展开申请表，再重新扫描。</span></div>
      <button type="button" onClick={() => void scanPage()}>重新扫描</button>
    </section> : null}

    {phase === "confirm" && <section className="review-card">
      <div className="review-heading"><strong>确认填写 {matched.length} 项</strong><button className="review-back-button" onClick={() => setPhase("review")}>返回</button></div>
      <div className="fill-mode-control" role="group" aria-label="选择填写方式">
        <div className="segmented-control">
          <button type="button" aria-pressed={fillMode === "incremental"} className={fillMode === "incremental" ? "segment-active" : ""} onClick={() => changeFillMode("incremental")}>保留已有内容</button>
          <button type="button" aria-pressed={fillMode === "overwrite"} className={fillMode === "overwrite" ? "segment-active" : ""} onClick={() => changeFillMode("overwrite")}>覆盖已有内容</button>
        </div>
      </div>
      <div className="fill-preview-list">
        {fillPreview.map((item) => <div className="fill-preview-row" key={item.fieldId}><strong>{item.label}</strong><span>{item.value}</span></div>)}
        {!fillPreview.length ? <span className="empty-copy">暂无可自动填写的内容</span> : null}
      </div>
      <button className="button-primary review-confirm-button" onClick={fill}>确认填写</button>
    </section>}

    {!!fields.length && <>
      {pageStale ? <p className="page-stale-banner">页面表单刚刚更新，请重新扫描后继续。</p> : null}
      {pending.length ? <section className="attention-section">
        <div className="compact-heading"><strong>需要你确认</strong><span>{pending.length} 项</span></div>
        <ul className="field-list">{pending.map(renderFieldRow)}</ul>
      </section> : <div className="all-matched-note">所有字段都已匹配，可以直接填写。</div>}

      {fields.some((field) => field.key === "photo" || field.key === "attachment") ? <section className="attachment-section">
        <div
          className={`upload-dropzone${draggingFiles ? " upload-dropzone-active" : ""}`}
          role="button"
          tabIndex={0}
          aria-label="选择照片或附件"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInputRef.current?.click(); } }}
          onDragEnter={(event) => { event.preventDefault(); setDraggingFiles(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDraggingFiles(false); }}
          onDrop={(event) => { event.preventDefault(); setDraggingFiles(false); void choosePhoto(event.dataTransfer.files); }}
        >
          <input ref={fileInputRef} className="file-input-hidden" aria-label="选择照片或附件文件" type="file" multiple accept="image/*,.pdf,.doc,.docx,application/pdf" onChange={(event) => void choosePhoto(event.target.files ?? undefined)} />
          <span className="upload-dropzone-icon"><PanelIcon name="upload" /></span>
          <span className="upload-dropzone-copy"><strong>{draggingFiles ? "松开即可添加附件" : "点击或拖拽上传照片 / 附件"}</strong><small>支持 JPG、PNG、PDF、DOC、DOCX，单个不超过 6MB</small></span>
          <span className="upload-dropzone-arrow">›</span>
        </div>
        {photoData.length ? <div className="attachment-preview">
          <div className="attachment-heading"><strong>待确认文件</strong><span>{photoData.length} 个</span></div>
          <ul className="attachment-list">{photoData.map((file, index) => { const meta = describeAttachment(file); return <li key={`${file.fileName}-${file.mimeType}-${index}`}><span className="attachment-icon">{meta.icon}</span><span className="attachment-copy"><strong>{file.fileName}</strong><small>{meta.kind}</small></span><button type="button" aria-label={`移除${file.fileName}`} onClick={() => removeSelectedAttachment(index)}>×</button></li>; })}</ul>
          <button onClick={() => { photoDataRef.current = []; setPhotoData([]); setMessage("已清空待确认附件"); }}>清空全部</button>
        </div> : null}
        <button className="attachment-confirm-button" onClick={confirmPhoto} disabled={!photoData.length}>确认填入附件</button>
      </section> : null}

      {matched.length ? <details className="matched-details">
        <summary>查看已匹配的 {matched.length} 项</summary>
        <ul className="field-list field-list-matched">{matched.map(renderFieldRow)}</ul>
      </details> : null}

      <details className="advanced-tools">
        <summary><span><strong>智能辅助</strong><small>可选，用于难识别字段和内容草稿</small></span><span>展开</span></summary>
        <div className="advanced-tools-body">
          <label className="job-description-field">
            职位描述
            <textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} rows={3} placeholder="可选，粘贴后可辅助生成内容" />
          </label>
          <button className={`ai-button${aiPending ? " ai-button-pending" : ""}`} onClick={() => void analyzeWithAi()} disabled={phase === "filling" || aiPending}><PanelIcon name="sparkle" /> {aiPending ? "AI 分析中…" : "AI 分析未识别字段"}</button>
          {aiResult ? <div className="ai-result-summary" role="status"><div><strong>分析完成</strong><span>{aiResult.mappings.length} 个映射，{aiResult.drafts.length} 个草稿</span></div></div> : null}
          {aiResult?.mappings.length ? <details className="ai-mapping-details"><summary>查看并修正字段映射</summary><div className="ai-mapping-list">{aiResult.mappings.map((mapping) => { const field = fields.find((item) => item.id === mapping.fieldId); const level = aiConfidenceLevel(mapping.confidence); return <div className={`ai-mapping-row confidence-${level}`} key={mapping.fieldId}><div className="mapping-copy"><strong>{field?.label || mapping.fieldId}</strong><span>AI 建议</span></div>{field ? <select className="ai-mapping-select" aria-label={`修正${field.label || "字段"}映射`} value={field.key ?? ""} onChange={(event) => void confirmField(field, (event.target.value || null) as FieldKey | null)}><option value="">未匹配</option>{fieldOptions.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select> : <span className="mapping-unmatched">字段已变化</span>}<span className="confidence-badge">{formatAiConfidence(mapping.confidence)}</span></div>; })}</div></details> : null}
          {aiResult?.drafts.length ? <section className="draft-card">
            <strong>AI 草稿</strong>
            {aiResult.drafts.map((draft) => <label className="draft-field" key={draft.fieldKey}><span>{draft.fieldKey}</span>
              <textarea value={draftOverrides[draft.fieldKey] ?? ""} onChange={(event) => setDraftOverrides((current) => ({ ...current, [draft.fieldKey]: event.target.value }))} rows={3} />
              <span className="draft-actions"><button onClick={() => void analyzeWithAi(`只重新生成 ${draft.fieldKey} 草稿，保留其他字段不变`, draft.fieldKey)}>重新生成</button>
              <button onClick={() => { setAiResult((current) => current ? rejectDraft(current, draft.fieldKey) : current); setDraftOverrides((current) => { const next = { ...current }; delete next[draft.fieldKey]; return next; }); }}>删除</button></span>
            </label>)}
          </section> : null}
          <details className="diagnostic-details"><summary>开发诊断</summary><p className="metric-note">{formatSiteMetric(siteMetric)}</p></details>
        </div>
      </details>
    </>}

    {phase === "done" && <section className={failureReport ? "result-card result-warning" : "result-card result-success"}>
      <div className="result-heading"><span className="result-icon">{failureReport ? "!" : "✓"}</span><div><strong>{failureReport ? "填写部分完成" : "填写已完成"}</strong><span>{failureReport ? "请处理未填写字段后再提交" : "请检查页面内容，再手动提交"}</span></div></div>
      {failureReport ? <div className="failure-summary"><strong>{failureReport.failedFields.length} 个字段未填写</strong><span>失败原因已脱敏，可复制给开发人员排查</span><ul>{failureReport.failedFields.map((field) => <li key={field}><span>{field}</span><small>{failureReport.reasons[field] ?? "未匹配到页面控件"}</small></li>)}</ul><button className="diagnostic-button" onClick={() => void copyFailureReport()}>复制诊断报告</button></div> : null}
      <div className="result-actions"><button onClick={undo}>撤销本次填写</button><button className="button-primary" onClick={advanceStep}>填写下一步</button></div>
    </section>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
