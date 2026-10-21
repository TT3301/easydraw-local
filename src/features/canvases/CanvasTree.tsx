import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { orderedProjectNodes, type NativeProjectDocument, type ProjectNode } from "@easydraw/document-model";
import searchIcon from "../../../remix-icons/System/search-line.svg";
import addIcon from "../../../remix-icons/System/add-line.svg";
import moreIcon from "../../../remix-icons/System/more-line.svg";
import type { TreeOperation } from "./project-tree";
import "./canvas-tree.css";

interface Props {
  document: NativeProjectDocument;
  activate(id: string): void;
  operate?: (operation: TreeOperation) => string | null;
  t?: (text: string, values?: Record<string, string | number>) => string;
}
type MenuState = { id: string; left: number; top: number; trigger: HTMLButtonElement };

export function CanvasTree({ document: project, activate, operate, t = text => text }: Props) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const renameIdRef = useRef<string | null>(null);
  const canvases = orderedProjectNodes(project);
  const visible = canvases.filter(node => node.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const menuNode = canvases.find(node => node.id === menu?.id);
  const closeMenu = (restoreFocus = false) => {
    if (restoreFocus) menu?.trigger.focus();
    setMenu(null);
  };
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !menu.trigger.contains(event.target as Node)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); menu.trigger.focus(); setMenu(null); }
    };
    const reposition = () => setMenu(null);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [menu]);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  const run = (operation: TreeOperation) => { setMenu(null); return operate?.(operation) ?? null; };
  const rename = (node: ProjectNode) => {
    setMenu(null); renameIdRef.current = node.id; setRenaming(node.id); setDraftName(node.name);
  };
  const create = () => {
    const names = new Set(canvases.map(node => node.name));
    let index = 1;
    while (names.has(`${t("画布")} ${index}`)) index++;
    const name = `${t("画布")} ${index}`;
    setSearch("");
    const id = run({ op: "create", type: "canvas", parentId: null, name });
    if (id) rename({ id, type: "canvas", name, parentId: null, order: canvases.length });
  };
  const commitName = () => {
    const id = renameIdRef.current;
    if (!id) return;
    renameIdRef.current = null; setRenaming(null);
    if (draftName.trim()) run({ op: "rename", id, name: draftName });
  };
  const openMenu = (node: ProjectNode, trigger: HTMLButtonElement, point?: { x: number; y: number }) => {
    if (menu?.id === node.id) { closeMenu(true); return; }
    const bounds = trigger.getBoundingClientRect();
    setMenu({ id: node.id, trigger,
      left: Math.max(8, Math.min(point?.x ?? bounds.right - 176, window.innerWidth - 184)),
      top: Math.max(8, Math.min(point?.y ?? bounds.bottom + 4, window.innerHeight - 140)),
    });
  };
  const remove = (node: ProjectNode) => {
    closeMenu(true);
    if (window.confirm(`${t("删除画布")}“${node.name}”？\n${t("可以通过撤销恢复。")}`)) run({ op: "delete", id: node.id });
  };
  return <div className="canvas-tree">
    <div className="tree-toolbar">
      <span className="tree-count">{t("{count} 个画布", { count: canvases.length })}</span>
      <div className="tree-toolbar-actions">
        <button ref={searchButtonRef} className={`tree-icon-button ${searchOpen ? "is-open" : ""}`} aria-label={t("搜索画布")} title={t("搜索画布")} aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); setSearch(""); }}><img src={searchIcon} alt="" /></button>
        {operate && <button className="tree-icon-button" aria-label={t("新建画布")} title={t("新建画布")} onClick={create}><img src={addIcon} alt="" /></button>}
      </div>
    </div>
    {searchOpen && <input ref={searchRef} className="tree-search" aria-label={t("搜索画布名称")} placeholder={t("搜索画布")} value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { setSearch(""); setSearchOpen(false); searchButtonRef.current?.focus(); }
    }} />}
    <div role="list" aria-label={t("画布列表")} className="tree-nodes">
      {visible.map(node => <div key={node.id} role="listitem"
        className={`canvas-tree-row ${project.activeCanvasId === node.id ? "is-active" : ""} ${menu?.id === node.id ? "is-menu-open" : ""} ${dropTarget?.id === node.id ? dropTarget.before ? "drop-before" : "drop-after" : ""}`}
        draggable={Boolean(operate) && !renaming && !search.trim()}
        onDragStart={event => { closeMenu(); setDragging(node.id); event.dataTransfer.setData("text/plain", node.id); event.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragging(null); setDropTarget(null); }}
        onDragOver={event => {
          if (!dragging || dragging === node.id) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          setDropTarget({ id: node.id, before: event.clientY < bounds.top + bounds.height / 2 });
        }}
        onDrop={event => {
          event.preventDefault();
          if (dragging && dragging !== node.id && dropTarget?.id === node.id) {
            const index = canvases.findIndex(n => n.id === node.id);
            run({ op: "move", id: dragging, parentId: null, beforeId: dropTarget.before ? node.id : canvases[index + 1]?.id });
          }
          setDragging(null); setDropTarget(null);
        }}
        onContextMenu={event => {
          if (!operate) return;
          event.preventDefault();
          const trigger = event.currentTarget.querySelector<HTMLButtonElement>(".tree-more");
          if (trigger) openMenu(node, trigger, { x: event.clientX, y: event.clientY });
        }}>
        {renaming === node.id ? <input autoFocus aria-label={t("重命名")} value={draftName} maxLength={160} onFocus={event => event.currentTarget.select()} onChange={event => setDraftName(event.target.value)} onBlur={commitName} onKeyDown={event => {
          event.stopPropagation();
          if (event.key === "Enter") commitName();
          if (event.key === "Escape") { renameIdRef.current = null; setRenaming(null); }
        }} /> : <button className="tree-name" title={node.name} aria-current={project.activeCanvasId === node.id ? "true" : undefined} onClick={() => activate(node.id)} onDoubleClick={() => operate && rename(node)}>{node.name}</button>}
        {operate && <button className="tree-icon-button tree-more" aria-label={`${t("管理")} ${node.name}`} aria-haspopup="menu" aria-expanded={menu?.id === node.id} onClick={event => openMenu(node, event.currentTarget)}><img src={moreIcon} alt="" /></button>}
      </div>)}
      {search.trim() && visible.length === 0 && <p className="tree-empty">{t("没有匹配的画布")}</p>}
      {canvases.length === 0 && !search.trim() && <p className="tree-empty">{t("新建画布，开始绘制")}</p>}
    </div>
    {menu && menuNode && operate && createPortal(<div ref={menuRef} className="app-menu-popover canvas-context-menu" role="menu" aria-label={t("画布操作")} style={{ left: menu.left, top: menu.top }} onKeyDown={event => {
      event.stopPropagation();
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
      if (event.key === "Tab") setMenu(null);
    }}>
      <button role="menuitem" onClick={() => rename(menuNode)}>{t("重命名")}</button>
      <button role="menuitem" onClick={() => { const id = run({ op: "duplicate", id: menuNode.id }); if (id) activate(id); }}>{t("复制画布")}</button>
      <span className="menu-separator" role="separator" />
      <button className="is-danger" role="menuitem" onClick={() => remove(menuNode)}>{t("删除")}</button>
    </div>, document.body)}
  </div>;
}
