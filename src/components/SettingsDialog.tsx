import type { Dispatch, SetStateAction } from "react";
import type { AppLocale } from "../core/i18n";
import { APP_LOCALES } from "../core/i18n";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Translate = (key: string, values?: Record<string, string | number>) => string;

interface Props {
  settingsOpen: boolean;
  setSettingsOpen: Setter<boolean>;
  t: Translate;
  locale: AppLocale;
  setLocale: Setter<AppLocale>;
}
export function SettingsDialog({ settingsOpen, setSettingsOpen, t, locale, setLocale }: Props) {

return <>
      {settingsOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
          >
            <div className="dialog-heading settings-dialog__heading">
              <div>
                <h2 id="settings-dialog-title">{t("设置")}</h2>
                <p>{t("偏好设置")}</p>
              </div>
              <button
                className="dialog-close"
                onClick={() => setSettingsOpen(false)}
                aria-label={t("关闭设置")}
              >
                ×
              </button>
            </div>
            <div className="settings-section">
              <div className="settings-section__copy">
                <h3>{t("界面语言")}</h3>
                <p>
                  {t("选择 EasyDraw 菜单、按钮、提示与画布工具使用的语言。")}
                </p>
              </div>
              <div className="language-options" role="radiogroup" aria-label={t("语言")}>
                {APP_LOCALES.map((option) => (
                  <label
                    className={
                      locale === option.code
                        ? "language-option is-selected"
                        : "language-option"
                    }
                    key={option.code}
                  >
                    <input
                      type="radio"
                      name="app-locale"
                      value={option.code}
                      checked={locale === option.code}
                      onChange={() => setLocale(option.code)}
                    />
                    <span>
                      <strong>{option.nativeLabel}</strong>
                      <small>{t(option.descriptionKey)}</small>
                    </span>
                    <span className="language-option__check" aria-hidden="true">
                      {locale === option.code ? "✓" : ""}
                    </span>
                  </label>
                ))}
              </div>
              <p className="settings-hint">
                {t("语言更改会立即生效并自动保存。")}
              </p>
            </div>
            <div className="dialog-actions settings-dialog__actions">
              <button
                className="primary-action"
                onClick={() => setSettingsOpen(false)}
              >
                {t("完成")}
              </button>
            </div>
          </section>
        </div>
      )}

</>;
}
