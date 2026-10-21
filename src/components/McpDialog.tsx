import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { McpConnectionInfo, McpRuntimeStatus } from "../core/mcp-bridge";
import { McpGuideDialog } from "./McpGuideDialog";

type Translate = (key: string, values?: Record<string, string | number>) => string;
interface Props {
  mcpDialogOpen: boolean;
  setMcpDialogOpen: Dispatch<SetStateAction<boolean>>;
  t: Translate;
  mcpRuntime: McpRuntimeStatus | null;
  mcpConnectionInfo: McpConnectionInfo | null;
  mcpLoading: boolean;
  setMcpEnabled: (enabled: boolean) => Promise<void>;
  skillUpdateAvailable: boolean;
  acknowledgeSkillUpdate: () => void;
}

export function McpDialog({ mcpDialogOpen, setMcpDialogOpen, t, mcpRuntime, mcpConnectionInfo, mcpLoading, setMcpEnabled, skillUpdateAvailable, acknowledgeSkillUpdate }: Props) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [tab, setTab] = useState<"mcp" | "skills">("mcp");
  const [skillNotice, setSkillNotice] = useState("");
  const [updatingSkills, setUpdatingSkills] = useState(false);
  const guideButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!guideOpen) guideButton.current?.focus(); }, [guideOpen]);
  if (!mcpDialogOpen) return null;
  if (guideOpen) return <McpGuideDialog {...{ t, mcpConnectionInfo }} onClose={() => setGuideOpen(false)} />;
  const desktop = Boolean(window.easydrawDesktop);
  const enabled = Boolean(mcpRuntime?.enabled);
  const skillName = mcpConnectionInfo?.skillPath.split(/[\\/]/).pop() || "Skills";
  const clientNames = new Set<string>();
  const clients = (enabled ? mcpRuntime?.clients ?? [] : []).filter(client => {
    if (!client.name) return true;
    if (clientNames.has(client.name)) return false;
    clientNames.add(client.name);
    return true;
  });
  const copySkillDirectory = async () => {
    try {
      if (!await window.easydrawDesktop?.copySkillDirectory()) throw new Error("Copy failed");
      setSkillNotice("Skills 目录已复制，可粘贴给 Agent。");
    } catch { setSkillNotice("无法复制 Skills 目录，请重启 EasyDraw 后重试。"); }
  };
  const updateSkills = async () => {
    setUpdatingSkills(true);
    setSkillNotice("");
    try {
      if (!await window.easydrawDesktop?.updateSkills()) throw new Error("Update failed");
      setSkillNotice("Skills 已更新到公共目录，请在 Agent 中重新加载或新建会话。");
      try { acknowledgeSkillUpdate(); }
      catch { setSkillNotice("Skills 已更新，但无法保存更新提示状态。"); }
    } catch { setSkillNotice("无法更新 Skills，请重启 EasyDraw 并检查公共目录权限后重试。"); }
    finally { setUpdatingSkills(false); }
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setMcpDialogOpen(false); }}>
    <section className="mcp-dialog" role="dialog" aria-modal="true" aria-labelledby="mcp-dialog-title" onKeyDown={event => {
      if (event.key === "Tab") {
        const focusable = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled):not([tabindex='-1']), [tabindex='0']");
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <div className="dialog-heading mcp-dialog__heading">
        <h2 id="mcp-dialog-title">AI</h2>
        <button className="dialog-close" onClick={() => setMcpDialogOpen(false)} aria-label={t("关闭 AI 设置")}>×</button>
      </div>
      <div className="mcp-tabs-row">
        <div className="mcp-tabs" role="tablist" aria-label={t("AI 设置分类")} onKeyDown={event => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next = event.key === "Home" ? "mcp" : event.key === "End" ? "skills" : tab === "mcp" ? "skills" : "mcp";
            setTab(next);
            document.getElementById(`ai-tab-${next}`)?.focus();
          }
        }}>
          {(["mcp", "skills"] as const).map(item => <button key={item} id={`ai-tab-${item}`} role="tab" aria-selected={tab === item} aria-controls={`ai-panel-${item}`} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)}>
            {item === "mcp" ? "MCP" : "Skills"}
            {item === "skills" && skillUpdateAvailable && <span className="skill-update-dot" role="img" aria-label={t("Skills 有新版本")} />}
          </button>)}
        </div>
      </div>
      {tab === "mcp" ? <div className="mcp-panel mcp-panel--connections" id="ai-panel-mcp" role="tabpanel" aria-labelledby="ai-tab-mcp">
        <div className="mcp-service-row">
          <div>
            <strong>{t("允许 MCP 访问")}</strong>
            <p id="mcp-access-description">{t("开启后，本机 Agent 可以读取和修改当前项目。关闭会断开所有连接。")}</p>
          </div>
          <button className={`access-switch${enabled ? " is-on" : ""}`} role="switch" aria-checked={enabled} aria-label={t("允许 MCP 访问")} aria-describedby="mcp-access-description"
            disabled={!desktop || !mcpRuntime || mcpLoading} onClick={() => void setMcpEnabled(!enabled)}><span /></button>
        </div>
        <div className="mcp-clients">
          {clients.length > 0 && <>
            <h3>{t("已连接的客户端")}</h3>
            <ul className="mcp-client-list" tabIndex={0} aria-label={t("已连接的客户端")}>
              {clients.map((client, index) => <li className="mcp-client-row" key={index} data-mcp-client={client.name ?? ""}>
                <span className="connection-dot connection-dot--connected" aria-hidden="true" />
                <strong>{client.name || t("未提供名称的客户端")}</strong>
                {client.version && <span>{client.version}</span>}
              </li>)}
            </ul>
          </>}
        </div>
        <div className="mcp-actions">
          <button ref={guideButton} className="button button--secondary" onClick={() => setGuideOpen(true)}>{t("查看接入指南")}</button>
        </div>
      </div> : <div className="mcp-panel" id="ai-panel-skills" role="tabpanel" aria-labelledby="ai-tab-skills" tabIndex={0}>
        <p>{t("Skills 随 EasyDraw 更新，但不会自动推送给 Agent。")}<br />
          {t("点击「更新Skills」，可将应用内置的技能安装或更新到当前用户的公共目录 {path}。",{path:"~/.agents/skills"})}<br />
          {t("如果希望安装到其他目录，请点击「复制 Skills 目录」，将路径交给 Agent，由它完成安装或更新。")}</p>
        <section className="mcp-skill-card">
          <div className="mcp-skill-heading">
            <h3>{skillName}</h3>
            {skillUpdateAvailable && <>
              <span className="mcp-skill-update-label">{t("有更新")}</span>
              <button className="button button--quiet mcp-acknowledge-skill" disabled={updatingSkills} aria-label={t("标记为已读")} title={t("标记为已读")} onClick={() => {
                try { acknowledgeSkillUpdate(); setSkillNotice(""); }
                catch { setSkillNotice("无法保存 Skills 确认状态，请稍后重试。"); }
              }}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="m7 12 3 3 7-7" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>{t("标记为已读")}</span>
              </button>
            </>}
          </div>
          <p>{t("用于创建和调整可编辑的低保真产品界面草图，包含绘制方法与协议说明。")}</p>
          {mcpConnectionInfo && <code className="mcp-skill-path">{mcpConnectionInfo.skillPath}</code>}
          <div className="mcp-actions">
            <button className="button button--secondary mcp-update-skill" disabled={!desktop || !mcpConnectionInfo || updatingSkills} aria-busy={updatingSkills} onClick={() => void updateSkills()}>{t(updatingSkills ? "更新中…" : "更新Skills")}</button>
            <button className="button button--secondary mcp-copy-skill" disabled={!desktop || !mcpConnectionInfo || updatingSkills} onClick={() => void copySkillDirectory()}>{t("复制 Skills 目录")}</button>
          </div>
          {skillNotice && <p className="mcp-skill-notice" role="status" aria-live="polite">{t(skillNotice)}</p>}
        </section>
      </div>}
    </section>
  </div>;
}
