import type { Dispatch, SetStateAction } from "react";

import type { ControllerSnapshot } from "../core/scene-controller";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Translate = (key: string, values?: Record<string, string | number>) => string;

interface Props {
  t: Translate;
  openAppMenu: "file" | "edit" | "view" | "windows" | null;
  setOpenAppMenu: Setter<"file" | "edit" | "view" | "windows" | null>;
  newProject: () => Promise<void>;
  openProject: () => Promise<void>;
  saveProject: (saveAs?: boolean) => Promise<void>;
  setSettingsOpen: Setter<boolean>;
  undo: () => void;
  redo: () => void;
  snapshot: ControllerSnapshot;
  leftPanelOpen: boolean;
  setLeftPanelOpen: Setter<boolean>;
  setCanvasZoom: (zoom: number) => void;
}
export function ApplicationMenu({ t, openAppMenu, setOpenAppMenu, newProject, openProject, saveProject, setSettingsOpen, undo, redo, snapshot, leftPanelOpen, setLeftPanelOpen, setCanvasZoom }: Props) {

return <>
      <header className="menu-bar" aria-label={t("应用菜单")}>
        {openAppMenu && (
          <button
            className="menu-dismiss"
            aria-label={t("关闭菜单")}
            onClick={() => setOpenAppMenu(null)}
          />
        )}
        <div className="menu-item">
          <button
            className={openAppMenu === "file" ? "menu-trigger is-open" : "menu-trigger"}
            onClick={() =>
              setOpenAppMenu((current) => (current === "file" ? null : "file"))
            }
            aria-expanded={openAppMenu === "file"}
          >
            {t("文件")}
          </button>
          {openAppMenu === "file" && (
            <div className="app-menu-popover" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  setOpenAppMenu(null);
                  void newProject();
                }}
              >
                <span>{t("新建项目")}</span><kbd>Ctrl N</kbd>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setOpenAppMenu(null);
                  void openProject();
                }}
              >
                <span>{t("打开项目")}</span><kbd>Ctrl O</kbd>
              </button>
              <span className="menu-separator" />
              <button
                role="menuitem"
                onClick={() => {
                  setOpenAppMenu(null);
                  void saveProject();
                }}
              >
                <span>{t("保存项目")}</span><kbd>Ctrl S</kbd>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setOpenAppMenu(null);
                  void saveProject(true);
                }}
              >
                <span>{t("另存项目")}</span><kbd>Ctrl Shift S</kbd>
              </button>
              <span className="menu-separator" />
              <button
                role="menuitem"
                onClick={() => {
                  setOpenAppMenu(null);
                  setSettingsOpen(true);
                }}
              >
                <span>{t("设置…")}</span>
              </button>
            </div>
          )}
        </div>

        <div className="menu-item">
          <button
            className={openAppMenu === "edit" ? "menu-trigger is-open" : "menu-trigger"}
            onClick={() =>
              setOpenAppMenu((current) => (current === "edit" ? null : "edit"))
            }
            aria-expanded={openAppMenu === "edit"}
          >
            {t("编辑")}
          </button>
          {openAppMenu === "edit" && (
            <div className="app-menu-popover" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  setOpenAppMenu(null);
                  undo();
                }}
                disabled={!snapshot.canUndo}
              >
                <span>{t("撤销")}</span><kbd>Ctrl Z</kbd>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setOpenAppMenu(null);
                  redo();
                }}
                disabled={!snapshot.canRedo}
              >
                <span>{t("重做")}</span><kbd>Ctrl Shift Z</kbd>
              </button>
            </div>
          )}
        </div>

        <div className="menu-item">
          <button
            className={openAppMenu === "view" ? "menu-trigger is-open" : "menu-trigger"}
            onClick={() =>
              setOpenAppMenu((current) => (current === "view" ? null : "view"))
            }
            aria-expanded={openAppMenu === "view"}
          >
            {t("视图")}
          </button>
          {openAppMenu === "view" && (
            <div className="app-menu-popover" role="menu">
              <button
                role="menuitemcheckbox"
                aria-checked={leftPanelOpen}
                onClick={() => setLeftPanelOpen((current) => !current)}
              >
                <span>{leftPanelOpen ? "✓" : ""} {t("左侧边栏")}</span>
              </button>
              <span className="menu-separator" />
              <button role="menuitem" onClick={() => setCanvasZoom(100)}>
                <span>{t("实际大小")}</span><kbd>100%</kbd>
              </button>
            </div>
          )}
        </div>

        <div className="menu-item">
          <button
            className={openAppMenu === "windows" ? "menu-trigger is-open" : "menu-trigger"}
            onClick={() =>
              setOpenAppMenu((current) =>
                current === "windows" ? null : "windows",
              )
            }
            aria-expanded={openAppMenu === "windows"}
          >
            {t("窗口")}
          </button>
          {openAppMenu === "windows" && (
            <div className="app-menu-popover" role="menu">
              <button role="menuitem" disabled>
                <span>✓ {t("EasyDraw 主窗口")}</span>
              </button>
            </div>
          )}
        </div>
      </header>

</>;
}
