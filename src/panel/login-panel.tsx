import React, { useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { isEmbeddedLoginResult } from "../shared/embedded-login";
import { withRequestTimeout } from "../shared/request-timeout";

/** 使用微信官方页面展示二维码，插件不加载远程脚本，也不读取微信页面内容。 */
export function LoginPanel({ openWebsite, refreshLogin, pending }: { openWebsite: () => void; refreshLogin: () => void; pending: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "expired">("loading");
  const [scale, setScale] = useState(.66);
  const shell = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const node = shell.current;
    if (!node) return;
    const measure = () => setScale(Math.min(.66, node.clientWidth / 300));
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let disposed = false, completing = false, requestId = "";
    setUrl(""); setPhase("loading");
    const cancel = (id: string) => void browser.runtime.sendMessage({ type: "CANCEL_EMBEDDED_LOGIN", requestId: id }).catch(() => undefined);
    const ready = (event: MessageEvent) => {
      if (isEmbeddedLoginResult(event, frame.current?.contentWindow) && event.data?.type === "OFFER_STAR_EMBEDDED_LOGIN_RESULT" && typeof event.data.token === "string" && requestId && !completing) {
        completing = true;
        void browser.runtime.sendMessage({ type: "COMPLETE_EMBEDDED_LOGIN", token: event.data.token, requestId }).then((result) => {
          if (!disposed && !result?.success) { setPhase("error"); setUrl(""); }
        }).catch(() => { if (!disposed) { setPhase("error"); setUrl(""); } });
        return;
      }
      if (!event.isTrusted || event.origin !== "https://open.weixin.qq.com" || event.source !== frame.current?.contentWindow) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "status" && data.status === "wxQRcodeReady") setPhase("ready");
      } catch { /* 忽略不符合微信约定的消息，不接收页面传来的 token。 */ }
    };
    window.addEventListener("message", ready);
    const slow = window.setTimeout(() => setPhase((current) => current === "loading" ? "error" : current), 15000);
    const expiry = window.setTimeout(() => { setPhase("expired"); setUrl(""); if (requestId) cancel(requestId); }, 120000);
    void withRequestTimeout(browser.runtime.sendMessage({ type: "GET_EMBEDDED_LOGIN_URL" }), 12000, "二维码加载超时").then((result) => {
      if (result?.requestId) requestId = result.requestId;
      if (disposed) { if (requestId) cancel(requestId); return; }
      if (result?.error || !result?.url) { setPhase("error"); return; }
      setUrl(result.url);
    }).catch(() => { if (!disposed) setPhase("error"); });
    return () => { disposed = true; window.clearTimeout(slow); window.clearTimeout(expiry); window.removeEventListener("message", ready); if (requestId) cancel(requestId); };
  }, [attempt]);
  const refresh = () => { setPhase("loading"); setUrl(""); setAttempt((value) => value + 1); };
  return <section className="login-panel" aria-label="扫码注册登录">
    <h1>扫码注册登录</h1>
    <p className="login-wechat"><span aria-hidden="true">●</span> 微信扫一扫</p>
    <div className="login-frame-shell" ref={shell} style={{ height: `${400 * scale}px` }} data-phase={phase} aria-busy={phase === "loading"}>
      {url ? <iframe ref={frame} key={`${attempt}:${url}`} title="微信扫码登录二维码" src={url} style={{ transform: `scale(${scale})` }} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms" /> : null}
      {phase !== "ready" ? <div className="login-frame-status" role="status">
        {phase === "loading" ? <><span className="login-spinner" />正在加载二维码…</> : <><strong>{phase === "expired" ? "二维码已过期" : "二维码暂未加载成功"}</strong><span>请刷新二维码，或使用官网登录</span><button type="button" onClick={refresh}>重试加载</button></>}
      </div> : null}
    </div>
    <p className="login-instruction">使用微信扫码，在手机上确认登录</p>
    <div className="login-actions"><button type="button" onClick={refresh}>刷新二维码</button><button type="button" disabled={pending} onClick={openWebsite}>官网窗口登录</button></div>
    <button className="login-reconnect" type="button" onClick={refreshLogin}>已在官网登录？同步登录状态</button>
  </section>;
}
