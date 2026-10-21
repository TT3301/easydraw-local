import { useEffect, useRef } from "react";

import closeIcon from "../../../remix-icons/System/close-line.svg";
import searchIcon from "../../../remix-icons/System/search-line.svg";
import smileIcon from "../../../remix-icons/User & Faces/emotion-happy-line.svg";
import type { AppLocale } from "../../core/i18n";
import { translateIconGroup } from "../../core/i18n";
import type { useAssets } from "./use-assets";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: Translate;
  locale: AppLocale;
  assets: ReturnType<typeof useAssets>;
}

export function IconLibraryPopover({
  open,
  onOpenChange,
  t,
  locale,
  assets,
}: Props) {
  const {
    iconLibrary,
    iconLibraryLoading,
    iconSearch,
    setIconSearch,
    iconGroup,
    setIconGroup,
    iconPreviews,
    insertingIconId,
    filteredLibraryIcons,
    visibleLibraryIcons,
    loadMoreLibraryIcons,
    insertLibraryIcon,
  } = assets;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const detailNameRef = useRef<HTMLSpanElement | null>(null);
  const detailMetaRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        onOpenChange(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () =>
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const showIconDetails = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const item = target.closest<HTMLButtonElement>(
      ".icon-library-popover__item",
    );
    if (!item) return;
    if (detailNameRef.current) {
      detailNameRef.current.textContent = item.dataset.iconName ?? "";
    }
    if (detailMetaRef.current) {
      detailMetaRef.current.textContent = `${iconLibrary?.icons.length ?? 0} · ${
        item.dataset.iconGroup ?? ""
      }`;
    }
  };

  const resetIconDetails = () => {
    if (detailNameRef.current) {
      detailNameRef.current.textContent = t("选择图标以查看详情");
    }
    if (detailMetaRef.current) {
      detailMetaRef.current.textContent = String(
        iconLibrary?.icons.length ?? 0,
      );
    }
  };

  return (
    <div className="easydraw-icon-library" ref={rootRef}>
      <button
        className={`ToolIcon Shape easydraw-icon-library__trigger${
          open ? " is-open" : ""
        }`}
        type="button"
        title={t("图标")}
        aria-label={t("图标")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span className="ToolIcon__icon">
          <img src={smileIcon} alt="" aria-hidden="true" draggable={false} />
        </span>
      </button>

      {open && (
        <section
          className="icon-library-popover"
          role="dialog"
          aria-modal="false"
          aria-label={t("图标")}
        >
          <header className="icon-library-popover__groups">
            <div
              className="icon-library-popover__group-list"
              role="tablist"
              aria-label={t("图标分组")}
            >
              <button
                className={iconGroup === "all" ? "is-active" : ""}
                type="button"
                role="tab"
                aria-selected={iconGroup === "all"}
                onClick={() => setIconGroup("all")}
              >
                {t("全部")}
              </button>
              {iconLibrary?.groups.map((group) => (
                <button
                  className={iconGroup === group ? "is-active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={iconGroup === group}
                  key={group}
                  onClick={() => setIconGroup(group)}
                >
                  {translateIconGroup(locale, group)}
                </button>
              ))}
            </div>
            <button
              className="icon-library-popover__close"
              type="button"
              aria-label={t("关闭图标面板")}
              onClick={() => onOpenChange(false)}
            >
              <img src={closeIcon} alt="" aria-hidden="true" />
            </button>
          </header>

          <div className="icon-library-popover__search-row">
            <label className="icon-library-popover__search">
              <span className="visually-hidden">{t("搜索图标")}</span>
              <img src={searchIcon} alt="" aria-hidden="true" />
              <input
                ref={searchRef}
                value={iconSearch}
                onChange={(event) => setIconSearch(event.target.value)}
                placeholder={t("搜索所有图标")}
                disabled={!iconLibrary?.configured}
              />
            </label>
          </div>

          <div
            className="icon-library-popover__content"
            onScroll={(event) => {
              const target = event.currentTarget;
              if (
                visibleLibraryIcons.length < filteredLibraryIcons.length &&
                target.scrollHeight - target.scrollTop - target.clientHeight < 120
              ) {
                loadMoreLibraryIcons();
              }
            }}
          >
            <div className="icon-library-popover__section-title">
              <strong>
                {iconGroup === "all"
                  ? t("全部图标")
                  : translateIconGroup(locale, iconGroup)}
              </strong>
              <span>{filteredLibraryIcons.length}</span>
            </div>

            {iconLibraryLoading ? (
              <div
                className="icon-library-popover__grid"
                aria-label={t("正在读取图标库")}
              >
                {Array.from({ length: 40 }, (_, index) => (
                  <span className="icon-library-skeleton" key={index} />
                ))}
              </div>
            ) : iconLibrary?.configured ? (
              visibleLibraryIcons.length > 0 ? (
                <div
                  className="icon-library-popover__grid"
                  onPointerOver={(event) => showIconDetails(event.target)}
                  onPointerLeave={resetIconDetails}
                  onFocusCapture={(event) => showIconDetails(event.target)}
                  onBlurCapture={resetIconDetails}
                >
                  {visibleLibraryIcons.map((icon) => {
                    const preview = iconPreviews[icon.id];
                    const isBusy = insertingIconId === icon.id;
                    return (
                      <button
                        className="icon-library-popover__item"
                        key={icon.id}
                        type="button"
                        title={`${icon.name} · ${translateIconGroup(locale, icon.group)}`}
                        aria-label={t("插入图标 {name}", { name: icon.name })}
                        data-icon-name={icon.name}
                        data-icon-group={translateIconGroup(locale, icon.group)}
                        onClick={() => {
                          void insertLibraryIcon(icon);
                          onOpenChange(false);
                        }}
                        disabled={Boolean(insertingIconId)}
                      >
                        {preview ? (
                          <img
                            src={preview}
                            alt=""
                            decoding="async"
                            draggable={false}
                          />
                        ) : (
                          <span className="icon-preview-placeholder" />
                        )}
                        {isBusy && (
                          <span className="visually-hidden">{t("插入中")}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="icon-library-popover__empty">
                  <strong>{t("没有匹配的图标")}</strong>
                  <span>{t("调整搜索词或切换分组")}</span>
                </div>
              )
            ) : (
              <div className="icon-library-popover__empty">
                <strong>{t("内置图标库加载失败")}</strong>
                <span>{t("请重新打开 EasyDraw")}</span>
              </div>
            )}
          </div>

          <footer className="icon-library-popover__footer">
            <span ref={detailNameRef}>{t("选择图标以查看详情")}</span>
            <span ref={detailMetaRef}>{iconLibrary?.icons.length ?? 0}</span>
          </footer>
        </section>
      )}
    </div>
  );
}
