import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

export type PreviewActions = { copy: (value: string) => void; fill: (value: string) => void };
export const PreviewActionContext = createContext<PreviewActions | null>(null);

/** 延迟单击，避免一次双击先复制再填写；所有显示截断都保留完整原文。 */
export function PreviewValue({ value, label = "简历信息" }: { value: string; label?: string }) {
  const actions = useContext(PreviewActionContext);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current=undefined; };
  useEffect(()=>cancel,[]);
  if (!actions) return <>{value}</>;
  return <button type="button" className="preview-value" aria-label={`${label}：${value}，单击复制，双击填入`} title="单击复制；双击替换网页中选中的输入框内容。Enter 复制，Shift+Enter 填入。"
    onClick={(event)=>{if(!event.isTrusted)return;cancel();if(event.detail<=1)timer.current=setTimeout(()=>actions.copy(value),350);}}
    onDoubleClick={(event)=>{if(!event.isTrusted)return;event.preventDefault();cancel();actions.fill(value);}}
    onKeyDown={(event)=>{if(!event.isTrusted||event.key!=="Enter")return;event.preventDefault();cancel();if(event.shiftKey)actions.fill(value);else actions.copy(value);}}
  >{value}</button>;
}

export function PreviewParts({ parts, separator = " · " }: { parts: string[]; separator?: string }) {
  return <>{parts.filter(Boolean).map((part,index)=><span key={index}>{index?separator:null}<PreviewValue value={part}/></span>)}</>;
}
