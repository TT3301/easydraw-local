import { useCallback, useEffect, useState } from "react";
import type { StoredProjectDocument } from "@easydraw/document-model";
import type { ShareExpiryDays, ShareStatus, ShareView } from "../../desktop-api";

type Translate = (key: string, values?: Record<string, string | number>) => string;
type Notice = { tone: "success" | "danger"; text: string } | null;
interface Props {
  t: Translate;
  onClose(): void;
  openSettings(): void;
  projectId: string;
  projectPath: string | null;
  /** Flushes pending canvas edits and returns the serializable project. */
  getDocument(): StoredProjectDocument;
}

const DAY_MS = 86_400_000;
const EXPIRY_OPTIONS: Array<{ value: ShareExpiryDays; label: string }> = [
  { value: null, label: "永久有效" }, { value: 7, label: "7 天" }, { value: 30, label: "30 天" },
];
const formatSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");

export function ShareIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" /><path d="m8.3 10.8 7.4-4.3M8.3 13.2l7.4 4.3" />
  </svg>;
}

export function ShareDialog({ t, onClose, openSettings, projectId, projectPath, getDocument }: Props) {
  const desktop = window.easydrawDesktop;
  const [status, setStatus] = useState<ShareStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [expiry, setExpiry] = useState<ShareExpiryDays>(null);

  const run = useCallback(async (task: () => Promise<ShareView | null | void>, success?: string) => {
    if (!desktop) return;
    setBusy(true);
    setNotice(null);
    try {
      const share = await task();
      if (share !== undefined) setStatus(current => current && { ...current, share, error: undefined });
      if (success) setNotice({ tone: "success", text: t(success) });
    } catch (error) { setNotice({ tone: "danger", text: errorText(error) }); }
    finally { setBusy(false); }
  }, [desktop, t]);

  useEffect(() => {
    if (!desktop) return;
    let current = true;
    desktop.getShareStatus({ projectId })
      .then(next => { if (current) setStatus(next); })
      .catch(error => { if (current) setNotice({ tone: "danger", text: errorText(error) }); });
    return () => { current = false; };
  }, [desktop, projectId]);

  const share = status?.share ?? null;
  const ready = Boolean(desktop && status?.configured && projectPath);
  const publish = () => run(() => desktop!.publishShare({ projectPath, document: getDocument(), expiresInDays: expiry }), share ? "分享内容已更新" : "分享链接已生成");
  const toggle = () => {
    if (!share) return publish();
    return run(() => desktop!.setShareEnabled({ projectId, enabled: !share.enabled }), share.enabled ? "链接已暂停，访问将返回 404" : "链接已恢复");
  };
  const remove = () => {
    if (!window.confirm(t("删除后链接永久失效，云端快照会被清除。确定删除？"))) return;
    return run(() => desktop!.deleteShare({ projectId }), "分享已删除");
  };
  const expiryLabel = (view: ShareView) => {
    if (!view.expiresAt) return t("永久有效");
    const days = Math.ceil((Date.parse(view.expiresAt) - Date.now()) / DAY_MS);
    return days > 0 ? t("{days} 天后过期", { days }) : t("已过期");
  };

  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title" onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
      <div className="dialog-heading share-dialog__heading">
        <span className="share-dialog__icon"><ShareIcon /></span>
        <div>
          <h2 id="share-dialog-title">{t("分享")}</h2>
          <p>{t("发布当前项目快照，获得可在浏览器打开的链接")}</p>
        </div>
        <button className="dialog-close" onClick={onClose} aria-label={t("关闭分享")}>×</button>
      </div>

      <div className="share-dialog__body">
        <div className="share-server-card">
          <div>
            <strong>{t("分享服务器")}</strong>
            <span>{status?.configured ? status.serverUrl : t("尚未配置")}</span>
          </div>
          <button className="button button--secondary" onClick={openSettings}>{t("服务器设置")}</button>
        </div>

        {!projectPath && <p className="share-hint">{t("请先保存项目，再发布分享。")}</p>}
        {status && !status.configured && <p className="share-hint">{t("在设置中填写你的 VPS 地址和访问令牌后即可发布。")}</p>}

        <div className="share-row">
          <strong id="share-switch-label">{t("链接分享")}</strong>
          <button className={`access-switch${share?.enabled ? " is-on" : ""}`} role="switch" aria-checked={Boolean(share?.enabled)}
            aria-labelledby="share-switch-label" disabled={!ready || busy} onClick={() => void toggle()}><span /></button>
        </div>

        {share ? <>
          <div className="share-link-row">
            <input className="share-link" readOnly value={share.link} aria-label={t("分享链接")} />
            <button className="button button--secondary" disabled={busy} onClick={() => void run(async () => { await desktop!.copyShareLink({ projectId }); }, "分享链接已复制")}>{t("复制")}</button>
          </div>
          <p className="share-meta">
            {formatSize(share.size)} · {new Date(share.updatedAt).toLocaleString()} · {expiryLabel(share)}{!share.enabled && ` · ${t("已暂停")}`}
          </p>
          <div className="share-actions">
            <button className="button button--secondary" disabled={!ready || busy} onClick={() => void publish()}>{t(busy ? "处理中…" : "更新内容")}</button>
            <button className="button button--secondary" disabled={busy} onClick={() => void remove()}>{t("删除")}</button>
            <label className="share-expiry">
              <span>{t("有效期")}</span>
              <select value={share.expiresAt ? "" : "null"} disabled={busy} onChange={event => {
                const value = event.target.value === "null" ? null : Number(event.target.value) as ShareExpiryDays;
                void run(() => desktop!.setShareExpiry({ projectId, expiresInDays: value }), "有效期已更新");
              }}>
                {share.expiresAt && <option value="" disabled>{expiryLabel(share)}</option>}
                {EXPIRY_OPTIONS.map(option => <option key={String(option.value)} value={String(option.value)}>{t(option.value ? "从现在起 {label}" : option.label, { label: t(option.label) })}</option>)}
              </select>
            </label>
          </div>
        </> : <label className="share-expiry">
          <span>{t("有效期")}</span>
          <select value={String(expiry)} disabled={!ready || busy} onChange={event => setExpiry(event.target.value === "null" ? null : Number(event.target.value) as ShareExpiryDays)}>
            {EXPIRY_OPTIONS.map(option => <option key={String(option.value)} value={String(option.value)}>{t(option.label)}</option>)}
          </select>
        </label>}

        {status?.error && <p className="share-notice share-notice--danger" role="status">{status.error}</p>}
        {notice && <p className={`share-notice share-notice--${notice.tone}`} role="status" aria-live="polite">{notice.text}</p>}
      </div>

      <div className="share-security">
        <strong>{t("端到端加密")}</strong>
        <p>{t("项目内容和素材在本机加密，服务器仅保存密文。任何拿到完整链接的人都能查看，请谨慎转发。")}</p>
      </div>
    </section>
  </div>;
}
