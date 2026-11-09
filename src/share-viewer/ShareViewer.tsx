import { useEffect, useMemo, useState } from "react";
import { EasyDraw, MainMenu } from "@easydraw/canvas-engine";
import type { BinaryFileData, BinaryFiles, DataURL } from "@easydraw/canvas-engine/types";
import { NativeProjectDocumentSchema, projectCanvasIds, selectProjectCanvas, type StoredProjectDocument } from "@easydraw/document-model";
import { CANVAS_CONTENT_FIT } from "../canvas/use-canvas-ui";
import { decodeSnapshot, keyFromFragment } from "../features/share/snapshot-codec";

type Loaded = { project: StoredProjectDocument; files: BinaryFiles };
type State = { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; data: Loaded };

const english = !navigator.language.toLowerCase().startsWith("zh");
const text = (zh: string, en: string) => (english ? en : zh);

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

/** Fetches, decrypts, and validates the snapshot named by /s/<id>#<key>. */
async function loadShare(): Promise<Loaded> {
  const id = /^\/s\/([A-Za-z0-9_-]{22})\/?$/.exec(location.pathname)?.[1];
  const key = keyFromFragment(location.hash);
  if (!id || !key) throw new Error(text("链接不完整：缺少分享编号或密钥", "Incomplete link: the share id or key is missing"));
  const response = await fetch(`/api/shares/${id}/blob`, { cache: "no-store" });
  if (response.status === 404) throw new Error(text("分享不存在、已暂停或已过期", "This share does not exist, is paused, or has expired"));
  if (!response.ok) throw new Error(text(`加载失败（${response.status}）`, `Failed to load (${response.status})`));
  const snapshot = await decodeSnapshot(new Uint8Array(await response.arrayBuffer()), key).catch(() => {
    throw new Error(text("无法解密：链接密钥错误或内容已损坏", "Cannot decrypt: the link key is wrong or the content is damaged"));
  });
  const parsed = NativeProjectDocumentSchema.safeParse(snapshot.document);
  if (!parsed.success) throw new Error(text("快照内容格式无效", "The snapshot content is invalid"));
  const { activeCanvasId: _active, scene: _scene, focusedPageElementId: _focus, ...project } = parsed.data;
  const now = Date.now();
  const files: BinaryFiles = {};
  for (const asset of project.assets) {
    const bytes = snapshot.assets.get(asset.relativePath);
    if (!bytes) continue; // Missing assets render as the engine's placeholder.
    files[asset.id] = {
      id: asset.id as BinaryFileData["id"], mimeType: asset.mimeType as BinaryFileData["mimeType"],
      dataURL: `data:${asset.mimeType};base64,${bytesToBase64(bytes)}` as DataURL, created: now, lastRetrieved: now,
    };
  }
  return { project, files };
}

export function ShareViewer() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [canvasId, setCanvasId] = useState<string | null>(null);

  useEffect(() => {
    // A different key in the fragment means a different snapshot view; reload to decrypt afresh.
    const reload = () => location.reload();
    window.addEventListener("hashchange", reload);
    loadShare().then(
      data => { setState({ phase: "ready", data }); document.title = `${data.project.name} · EasyDraw`; },
      error => setState({ phase: "error", message: error instanceof Error ? error.message : String(error) }),
    );
    return () => window.removeEventListener("hashchange", reload);
  }, []);

  const project = state.phase === "ready" ? state.data.project : null;
  const canvases = useMemo(() => project ? projectCanvasIds(project).map(id => ({ id, name: project.tree.find(node => node.id === id)?.name ?? id })) : [], [project]);
  const selected = project ? selectProjectCanvas(project, canvasId) : null;

  if (state.phase !== "ready" || !project || !selected) {
    return <main className="viewer-status">
      <strong>EasyDraw</strong>
      <p role={state.phase === "error" ? "alert" : "status"}>{state.phase === "error" ? state.message : text("正在解密分享内容…", "Decrypting shared content…")}</p>
    </main>;
  }

  return <div className="viewer-shell">
    <header className="viewer-bar">
      <strong className="viewer-title">{project.name}</strong>
      {canvases.length > 1 && <nav className="viewer-tabs" aria-label={text("画布", "Canvases")}>
        {canvases.map(canvas => <button key={canvas.id} aria-current={canvas.id === selected.activeCanvasId} onClick={() => setCanvasId(canvas.id)}>{canvas.name}</button>)}
      </nav>}
      <span className="viewer-badge">{text("只读 · 端到端加密", "Read-only · End-to-end encrypted")}</span>
    </header>
    <main className="viewer-canvas">
      <EasyDraw
        key={selected.activeCanvasId ?? "empty"}
        viewModeEnabled
        initialData={{
          elements: selected.scene.elements,
          files: state.data.files,
          fitToContent: CANVAS_CONTENT_FIT,
          appState: { viewBackgroundColor: "#eef0f3" },
        }}
        theme="light"
        langCode={english ? "en" : "zh-CN"}
        UIOptions={{ tools: { image: false }, canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false, saveAsImage: false, clearCanvas: false, changeViewBackgroundColor: false } }}
      >
        {/* Explicit menu: replaces the engine default, which appends external project links. */}
        <MainMenu>
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </EasyDraw>
    </main>
  </div>;
}
