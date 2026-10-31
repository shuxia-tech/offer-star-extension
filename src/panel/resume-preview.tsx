import { useState, type ReactNode } from "react";
import { PreviewActionContext, PreviewParts, PreviewValue, type PreviewActions } from "./preview-value";
import type { ResumeProfile } from "../shared/messages";

type Entry = { title: string; period: string; meta: string; detail: string; titleParts?: string[]; periodParts?: string[]; metaParts?: string[] };

function text(value?: string) {
  return value?.trim() ?? "";
}

function displayTime(value?: string) {
  const current = text(value);
  return /^present$/i.test(current) ? "至今" : current;
}

function period(start?: string, end?: string) {
  return [displayTime(start), displayTime(end)].filter(Boolean).join(" - ");
}

function join(parts: Array<string | undefined>, separator = " · ") {
  return parts.map(text).filter(Boolean).join(separator);
}

function PreviewSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return <details className="preview-section"><summary><h4>{title}</h4>{count ? <small>{count} 项</small> : null}</summary><div className="preview-section-body">{children}</div></details>;
}

function CollapsibleText({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  const long = value.length > 96 || value.split("\n").length > 4;
  return <>
    <p className={!open && long ? "preview-clamp" : undefined}><PreviewValue value={value}/></p>
    {long ? <button type="button" className="preview-toggle" onClick={() => setOpen((current) => !current)}>{open ? "收起" : "展开全部"}</button> : null}
  </>;
}

function FactList({ items }: { items: Array<[string, string]> }) {
  const facts = items.filter(([, value]) => text(value));
  if (!facts.length) return null;
  return <PreviewSection title="基本信息" count={facts.length}><dl className="preview-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><PreviewValue value={value} label={label}/></dd></div>)}</dl></PreviewSection>;
}

function EntryList({ title, entries }: { title: string; entries: Entry[] }) {
  const visible = entries.filter((entry) => entry.title || entry.period || entry.meta || entry.detail);
  if (!visible.length) return null;
  return <PreviewSection title={title} count={visible.length}><div className="preview-entries">{visible.map((entry, index) => <article key={`${entry.title}-${index}`}>
    <strong>{entry.titleParts?.length ? <PreviewParts parts={entry.titleParts}/> : <PreviewValue value={entry.title || title}/>}</strong>
    {entry.period ? <small>{entry.periodParts?.length ? <PreviewParts parts={entry.periodParts} separator=" - "/> : <PreviewValue value={entry.period}/>}</small> : null}
    {entry.meta ? <small>{entry.metaParts?.length ? <PreviewParts parts={entry.metaParts}/> : <PreviewValue value={entry.meta}/>}</small> : null}
    {entry.detail ? <CollapsibleText value={entry.detail} /> : null}
  </article>)}</div></PreviewSection>;
}

/** 简历内容还在读取时，用骨架代替纯文字等待。 */
export function ResumePreviewSkeleton() {
  return <div className="resume-preview-skeleton" role="status" aria-label="正在读取简历内容">
    <span className="preview-skeleton-title" />
    <span className="preview-skeleton-line" />
    <span className="preview-skeleton-line preview-skeleton-short" />
    <span className="preview-skeleton-line preview-skeleton-mid" />
    <div className="preview-skeleton-card">
      <span className="preview-skeleton-line preview-skeleton-title" />
      <span className="preview-skeleton-line preview-skeleton-short" />
      <span className="preview-skeleton-line" />
      <span className="preview-skeleton-line preview-skeleton-mid" />
    </div>
    <div className="preview-skeleton-card">
      <span className="preview-skeleton-line preview-skeleton-title" />
      <span className="preview-skeleton-line preview-skeleton-short" />
      <span className="preview-skeleton-line" />
    </div>
  </div>;
}

/** 展示当前选中简历的文字内容，不使用简历预览图。 */
export function ResumePreview({ resume, actions }: { resume: ResumeProfile; actions?: PreviewActions }) {
  const basic = resume.basic;
  const education = resume.education.map((item) => ({
    title: join([item.school, item.degree, item.major]),
    titleParts: [item.school,item.degree,item.major].map(text).filter(Boolean),
    period: period(item.startTime, item.endTime),
    periodParts: [item.startTime,item.endTime].map(displayTime).filter(Boolean),
    meta: "",
    detail: text(item.description)
  }));
  const work = resume.workExperience.map((item) => ({
    title: join([item.company, item.position]),
    titleParts: [item.company,item.position].map(text).filter(Boolean),
    period: period(item.startTime, item.endTime),
    periodParts: [item.startTime,item.endTime].map(displayTime).filter(Boolean),
    meta: text(item.city),
    detail: text(item.description)
  }));
  const projects = (resume.projectExperience ?? []).map((item) => ({
    title: join([item.name, item.role]),
    titleParts: [item.name,item.role].map(text).filter(Boolean),
    period: period(item.startTime, item.endTime),
    periodParts: [item.startTime,item.endTime].map(displayTime).filter(Boolean),
    meta: "",
    detail: text(item.description)
  }));
  const activity = (items: ResumeProfile["campusExperience"] = []) => items.map((item) => ({
    title: join([item.name, item.role]),
    titleParts: [item.name,item.role].map(text).filter(Boolean),
    period: period(item.startTime, item.endTime),
    periodParts: [item.startTime,item.endTime].map(displayTime).filter(Boolean),
    meta: join([item.section, item.address], " · "),
    metaParts: [item.section,item.address].map(text).filter(Boolean),
    detail: text(item.description)
  }));
  const honors = (resume.honors?.length ? resume.honors : (resume.awards ?? []).map((name) => ({ name, time: "", level: "", issuer: "", description: "" }))).map((item) => ({
    title: text(item.name) || "荣誉奖项",
    period: text(item.time),
    meta: join([item.level, item.issuer], " · "),
    metaParts: [item.level,item.issuer].map(text).filter(Boolean),
    detail: text(item.description)
  }));
  const portfolio = (resume.portfolio ?? []).map((item) => ({
    title: text(item.name) || text(item.url),
    period: "",
    meta: text(item.url) && text(item.url) !== text(item.name) ? text(item.url) : "",
    detail: text(item.description)
  }));
  const skillsText = text(resume.skillsText) || resume.skills.map(text).filter(Boolean).join("\n");
  const introduction = text(resume.selfIntroduction);

  return <PreviewActionContext.Provider value={actions??null}><div className="resume-preview-body">
    <FactList items={[
      ["姓名", basic.name],
      ["手机", basic.phone],
      ["邮箱", basic.email],
      ["性别", basic.gender ?? ""],
      ["年龄", basic.age ?? ""],
      ["现居城市", basic.currentCity ?? ""],
      ["期望城市", basic.targetCity ?? ""],
      ["当前状态", basic.currentStatus ?? ""],
      ["求职意向", basic.targetPosition ?? ""],
      ["期望薪资", basic.targetSalary ?? ""],
      ["微信", basic.wechat ?? ""],
      ["个人网站", basic.website ?? ""],
      ["GitHub", basic.github ?? ""],
      ["Gitee", basic.gitee ?? ""],
      ["身高", basic.height ?? ""],
      ["体重", basic.weight ?? ""],
      ["民族", basic.nation ?? ""],
      ["籍贯", basic.nativePlace ?? ""],
      ["政治面貌", basic.politicalOutlook ?? ""],
      ["婚姻状态", basic.maritalStatus ?? ""]
    ]} />
    {skillsText ? <PreviewSection title="技能与证书"><CollapsibleText value={skillsText} /></PreviewSection> : null}
    <EntryList title="教育经历" entries={education} />
    <EntryList title="工作经历" entries={work} />
    <EntryList title="项目经历" entries={projects} />
    <EntryList title="校园经历" entries={activity(resume.campusExperience)} />
    <EntryList title="研究经历" entries={activity(resume.researchExperience)} />
    <EntryList title="荣誉奖项" entries={honors} />
    <EntryList title="作品集" entries={portfolio} />
    <EntryList title="其他经历" entries={activity(resume.otherExperience)} />
    {introduction ? <PreviewSection title="个人总结"><CollapsibleText value={introduction} /></PreviewSection> : null}
  </div></PreviewActionContext.Provider>;
}
