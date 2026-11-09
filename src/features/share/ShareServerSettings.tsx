import { useEffect, useState } from "react";
import type { ShareMode, ShareSettings } from "../../desktop-api";

type Translate = (key: string, values?: Record<string, string | number>) => string;
type Notice = { tone: "success" | "danger"; text: string } | null;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");

/**
 * Settings section for sharing: "LAN" runs the bundled server on this machine (address and token prefilled),
 * "Custom" points at the user's own server. Tokens are write-only from the renderer.
 */
export function ShareServerSettings({ t }: { t: Translate }) {
  const desktop = window.easydrawDesktop;
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [port, setPort] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const apply = (next: ShareSettings) => { setSettings(next); setServerUrl(next.serverUrl); setPort(String(next.lan.port)); };
  useEffect(() => {
    void desktop?.getShareSettings().then(apply, error => setNotice({ tone: "danger", text: errorText(error) }));
  }, [desktop]);
  if (!desktop || !settings) return null;

  const run = async (task: () => Promise<ShareSettings | string>, success?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await task();
      if (typeof result === "string") setNotice({ tone: "success", text: result });
      else { apply(result); if (success) setNotice({ tone: "success", text: t(success) }); }
    } catch (error) {
      setNotice({ tone: "danger", text: errorText(error) });
      void desktop.getShareSettings().then(apply, () => {});
    } finally { setBusy(false); }
  };
  const setMode = (mode: ShareMode) => run(() => desktop.setShareMode({ mode }));
  const saveCustom = (nextToken?: string | null) => run(async () => {
    const next = await desktop.setShareSettings({ serverUrl, ...(nextToken !== undefined ? { token: nextToken } : {}) });
    setToken("");
    return next;
  }, nextToken === null ? "访问令牌已清除" : "分享服务器设置已保存");
  const test = () => run(async () => {
    const { maxBytes } = await desktop.testShareServer();
    return t("连接成功，单个快照上限 {size} MB", { size: Math.round(maxBytes / 1024 / 1024) });
  });
  const lan = settings.lan;
  const lanUrl = `http://${lan.address}:${lan.port}`;

  return <div className="settings-section share-settings">
    <div className="settings-section__copy">
      <h3>{t("分享服务器")}</h3>
      <p>{t("没有公网服务器时，可用本机作为局域网分享服务器；也可以填写你自己的 VPS。")}</p>
    </div>
    <div className="share-mode" role="radiogroup" aria-label={t("分享服务器")}>
      {(["lan", "custom"] as const).map(mode => <label key={mode} className={settings.mode === mode ? "share-mode__option is-selected" : "share-mode__option"}>
        <input type="radio" name="share-mode" value={mode} checked={settings.mode === mode} disabled={busy} onChange={() => void setMode(mode)} />
        <span>{t(mode === "lan" ? "本机局域网" : "自定义服务器")}</span>
      </label>)}
    </div>

    {settings.mode === "lan" ? <div className="share-settings__form">
      <div className="share-row share-row--plain">
        <span>
          <strong id="lan-share-label">{t("启动局域网分享服务")}</strong>
          <small>{lan.running ? t("运行中：{url}", { url: lanUrl }) : t("未启动")}</small>
        </span>
        <button className={`access-switch${lan.enabled && lan.running ? " is-on" : ""}`} role="switch" aria-checked={lan.enabled && lan.running}
          aria-labelledby="lan-share-label" disabled={busy} onClick={() => void run(() => desktop.setLanShare({ enabled: !(lan.enabled && lan.running) }))}><span /></button>
      </div>
      <label>
        <span>{t("本机地址")}</span>
        <select value={lan.address} disabled={busy || lan.addresses.length === 0} onChange={event => void run(() => desktop.setLanShare({ address: event.target.value }))}>
          {lan.addresses.length === 0 && <option value={lan.address}>{t("未检测到局域网地址")}</option>}
          {lan.addresses.map(entry => <option key={entry.address} value={entry.address}>{entry.address}（{entry.name}）</option>)}
        </select>
      </label>
      <label>
        <span>{t("端口")}</span>
        <span className="share-settings__inline">
          <input type="number" min={1024} max={65535} value={port} onChange={event => setPort(event.target.value)} />
          <button className="button button--secondary" type="button" disabled={busy || Number(port) === lan.port}
            onClick={() => void run(() => desktop.setLanShare({ port: Number(port) }), "端口已更新")}>{t("保存")}</button>
        </span>
      </label>
      <p className="settings-hint">{t("访问令牌已自动生成并加密保存。其他设备需与本机处于同一局域网；本机关闭或休眠时链接无法打开。首次启动时 macOS 可能询问是否允许传入连接。")}</p>
      {lan.error && <p className="share-notice share-notice--danger" role="status">{lan.error}</p>}
    </div> : <form className="share-settings__form" onSubmit={event => { event.preventDefault(); void saveCustom(token.trim() ? token : undefined); }}>
      <label>
        <span>{t("服务器地址")}</span>
        <input type="url" value={serverUrl} placeholder="https://share.example.com" autoComplete="off" spellCheck={false}
          onChange={event => setServerUrl(event.target.value)} />
      </label>
      <label>
        <span>{t("访问令牌")}</span>
        <input type="password" value={token} autoComplete="new-password"
          placeholder={t(settings.hasToken ? "已保存，留空则保持不变" : "至少 32 个字符，与服务器 SHARE_TOKEN 一致")}
          onChange={event => setToken(event.target.value)} />
      </label>
      <div className="share-settings__actions">
        <button className="button button--primary" type="submit" disabled={busy}>{t("保存")}</button>
        <button className="button button--secondary" type="button" disabled={busy || !settings.hasToken} onClick={() => void test()}>{t("测试连接")}</button>
        {settings.hasToken && <button className="button button--danger-quiet" type="button" disabled={busy} onClick={() => void saveCustom(null)}>{t("清除令牌")}</button>}
      </div>
    </form>}
    {notice && <p className={`share-notice share-notice--${notice.tone}`} role="status" aria-live="polite">{notice.text}</p>}
  </div>;
}
