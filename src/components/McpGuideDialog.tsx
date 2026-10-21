import { useEffect, useRef, useState } from "react";
import type { McpConnectionInfo } from "../core/mcp-bridge";
import { buildMcpGuide } from "../core/mcp-guide";

interface Props {
  t: (key: string) => string;
  mcpConnectionInfo: McpConnectionInfo | null;
  onClose: () => void;
}

export function McpGuideDialog({ t, mcpConnectionInfo, onClose }: Props) {
  const guide = buildMcpGuide(mcpConnectionInfo, t);
  const dialog = useRef<HTMLElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => { dialog.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  const copyGuide = async () => {
    try {
      if (!await window.easydrawDesktop?.copyMcpConnectionInfo(guide.text)) throw new Error("Copy failed");
      setCopyStatus("完整接入指南已复制，可直接粘贴给 Agent。");
    } catch {
      setCopyStatus("无法复制接入指南，请稍后重试。");
    }
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="mcp-dialog mcp-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="mcp-guide-title" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const focusable = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']");
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <div className="dialog-heading mcp-dialog__heading">
        <div><h2 id="mcp-guide-title">{guide.title}</h2><p>{guide.introduction}</p></div>
        <button className="dialog-close" onClick={onClose} aria-label={t("关闭接入指南")}>×</button>
      </div>
      <div className="mcp-panel mcp-guide" tabIndex={0} role="region" aria-labelledby="mcp-guide-title">
        {guide.sections.map(section => <section key={section.title}>
          <h3>{section.title}</h3>
          {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {section.steps && <ol>{section.steps.map(step => <li key={step}>{step}</li>)}</ol>}
          {section.code && (section.language === "json"
            ? <pre className="mcp-command"><code>{section.code}</code></pre>
            : <code className="mcp-skill-path">{section.code}</code>)}
        </section>)}
      </div>
      <div className="mcp-guide-footer">
        <p role="status" aria-live="polite">{copyStatus ? t(copyStatus) : ""}</p>
        <div className="mcp-actions">
          <button className="button button--secondary" onClick={onClose}>{t("返回 AI")}</button>
          <button className="button button--primary" disabled={!window.easydrawDesktop || !mcpConnectionInfo} onClick={() => void copyGuide()}>{t("复制接入信息")}</button>
        </div>
      </div>
    </section>
  </div>;
}
