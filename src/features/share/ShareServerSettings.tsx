import { useEffect, useState } from "react";

type Translate = (key: string, values?: Record<string, string | number>) => string;
type Notice = { tone: "success" | "danger"; text: string } | null;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");

/** Settings section for the self-hosted share server. The token is write-only from the renderer. */
export function ShareServerSettings({ t }: { t: Translate }) {
  const desktop = window.easydrawDesktop;
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    void desktop?.getShareSettings().then(settings => { setServerUrl(settings.serverUrl); setHasToken(settings.hasToken); },
      error => setNotice({ tone: "danger", text: errorText(error) }));
  }, [desktop]);
  if (!desktop) return null;

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    try { setNotice({ tone: "success", text: await task() }); }
    catch (error) { setNotice({ tone: "danger", text: errorText(error) }); }
    finally { setBusy(false); }
  };
  const save = (nextToken?: string | null) => run(async () => {
    const settings = await desktop.setShareSettings({ serverUrl, ...(nextToken !== undefined ? { token: nextToken } : {}) });
    setServerUrl(settings.serverUrl);
    setHasToken(settings.hasToken);
    setToken("");
    return t(nextToken === null ? "访问令牌已清除" : "分享服务器设置已保存");
  });
  const test = () => run(async () => {
    const { maxBytes } = await desktop.testShareServer();
    return t("连接成功，单个快照上限 {size} MB", { size: Math.round(maxBytes / 1024 / 1024) });
  });

  return <div className="settings-section share-settings">
    <div className="settings-section__copy">
      <h3>{t("分享服务器")}</h3>
      <p>{t("填写你自己的 VPS 地址和访问令牌。令牌加密保存在系统钥匙串中，不会写入项目文件。")}</p>
    </div>
    <form className="share-settings__form" onSubmit={event => { event.preventDefault(); void save(token.trim() ? token : undefined); }}>
      <label>
        <span>{t("服务器地址")}</span>
        <input type="url" value={serverUrl} placeholder="https://share.example.com" autoComplete="off" spellCheck={false}
          onChange={event => setServerUrl(event.target.value)} />
      </label>
      <label>
        <span>{t("访问令牌")}</span>
        <input type="password" value={token} autoComplete="new-password"
          placeholder={t(hasToken ? "已保存，留空则保持不变" : "至少 32 个字符，与服务器 SHARE_TOKEN 一致")}
          onChange={event => setToken(event.target.value)} />
      </label>
      <div className="share-settings__actions">
        <button className="button button--primary" type="submit" disabled={busy}>{t("保存")}</button>
        <button className="button button--secondary" type="button" disabled={busy || !hasToken} onClick={() => void test()}>{t("测试连接")}</button>
        {hasToken && <button className="button button--danger-quiet" type="button" disabled={busy} onClick={() => void save(null)}>{t("清除令牌")}</button>}
      </div>
    </form>
    {notice && <p className={`share-notice share-notice--${notice.tone}`} role="status" aria-live="polite">{notice.text}</p>}
  </div>;
}
