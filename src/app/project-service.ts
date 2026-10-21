import { selectProjectCanvas, serializeProjectDocument } from "@easydraw/document-model";
import type { ProjectDocument } from "@easydraw/editor-contracts";
import { ProjectDocumentSchema, createInitialDocument } from "../core/protocol";
import type { AppLocale } from "../core/i18n";
import type { CanvasSession } from "../canvas/canvas-session";
import type { EditorSession } from "./editor-session";
import type { Notify } from "./ports";

type Desktop = Pick<NonNullable<Window["easydrawDesktop"]>, "openProject" | "saveProject" | "saveProjectAs">;
export interface ProjectState {
  projectPath: string | null;
  saveState: "saved" | "saving" | "error";
  startupResolved: boolean;
  startupAction: "new-project" | "open-project" | null;
  startupError: string | null;
}

/** Owns file identity and serializes writes so an older autosave cannot win. */
export class ProjectService {
  private state: ProjectState;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writes: Promise<unknown> = Promise.resolve();
  private lastSaved: ProjectDocument | null = null;
  private operation = 0;
  constructor(private session: EditorSession, private canvas: CanvasSession,
    private desktop: Desktop | undefined, private notify: Notify) {
    this.state = { projectPath: null, saveState: "saved", startupResolved: !desktop,
      startupAction: null, startupError: null };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<ProjectState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  connect() {
    let projectId = this.session.controller.getSnapshot().document.projectId;
    let active = this.session.controller.getSnapshot().document.activeCanvasId;
    const unsubscribe = this.session.controller.subscribe(() => {
      const doc = this.session.controller.getSnapshot().document;
      if (projectId !== doc.projectId || active !== doc.activeCanvasId) {
        projectId = doc.projectId; active = doc.activeCanvasId;
        try { localStorage.setItem(`easydraw:active:${projectId}`, active ?? ""); } catch { /* best effort */ }
      }
      this.scheduleSave();
    });
    return () => { unsubscribe(); this.cancelTimer(); this.operation++; };
  }
  private cancelTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private scheduleSave() {
    const document = this.session.controller.getSnapshot().document;
    if (!this.state.projectPath || (document.projectId === this.lastSaved?.projectId && document.revision === this.lastSaved?.revision)) return;
    this.cancelTimer();
    this.update({ saveState: "saving" });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.write(this.state.projectPath!, document).catch(error => {
        this.notify({ tone: "danger", text: `自动保存失败：${error.message}` });
      });
    }, 900);
  }
  private write(projectPath: string, document: ProjectDocument) {
    const scope = this.session.captureProject();
    const job = this.writes.catch(() => {}).then(() => this.desktop!.saveProject({ projectPath, document }));
    this.writes = job;
    return job.then(() => {
      if (scope.isCurrent() && this.state.projectPath === projectPath) {
        this.lastSaved = document;
        this.update({ saveState: this.session.controller.getSnapshot().document === document ? "saved" : "saving" });
      }
    }, error => {
      if (scope.isCurrent()) this.update({ saveState: "error" });
      throw error;
    });
  }
  private async preserveCurrentProject() {
    const document = this.canvas.flush();
    this.cancelTimer();
    if (this.state.projectPath && document !== this.lastSaved) await this.write(this.state.projectPath, document);
    await this.writes;
  }
  private accept(document: ProjectDocument, projectPath: string) {
    this.cancelTimer();
    this.lastSaved = document;
    this.update({ projectPath, saveState: "saved", startupResolved: true });
    try {
      const active = localStorage.getItem(`easydraw:active:${document.projectId}`);
      if (active && document.canvases[active]) document = selectProjectCanvas(serializeProjectDocument(document), active);
    } catch { /* first canvas is a safe fallback */ }
    this.session.replace(document);
    this.lastSaved = this.session.controller.getSnapshot().document;
    this.cancelTimer();
    this.update({ saveState: "saved" });
  }
  async open(projectPath?: string): Promise<void> {
    if (!this.desktop) return;
    if (this.state.startupAction) {
      if (!projectPath) return;
      await new Promise<void>(resolve => {
        const stop = this.subscribe(() => {
          if (!this.state.startupAction) { stop(); resolve(); }
        });
      });
      return this.open(projectPath);
    }
    const operation = ++this.operation;
    this.update({ startupAction: "open-project", startupError: null });
    try {
      const result = await this.desktop.openProject(projectPath);
      if (!result || operation !== this.operation) return;
      const legacy = (result.document as { schemaVersion: number }).schemaVersion === 3;
      const document = ProjectDocumentSchema.parse(result.document);
      await this.preserveCurrentProject();
      if (operation !== this.operation) return;
      this.accept(document, result.projectPath);
      const fileName = result.projectPath.split(/[\\/]/).pop() || document.name;
      this.notify({ tone: "success", text: legacy ? `已打开项目：${fileName}。已升级为多画布格式；保存时备份旧文件，旧版软件无法打开新版项目。` : `已打开项目：${fileName}` });
    } catch (error) { this.fail("打开项目", error); }
    finally { if (operation === this.operation) this.update({ startupAction: null }); }
  }
  async create(locale: AppLocale) {
    if (!this.desktop || this.state.startupAction) return;
    const operation = ++this.operation;
    this.update({ startupAction: "new-project", startupError: null });
    try {
      await this.preserveCurrentProject();
      const document = createInitialDocument(undefined, locale);
      const result = await this.desktop.saveProjectAs({ suggestedName: document.name, sourceProjectPath: null, document });
      if (!result || operation !== this.operation) return;
      await this.preserveCurrentProject();
      if (operation !== this.operation) return;
      this.accept(document, result.projectPath);
      this.notify({ tone: "success", text: "已创建并保存新项目" });
    } catch (error) { this.fail("新建项目", error); }
    finally { if (operation === this.operation) this.update({ startupAction: null }); }
  }
  async save(forceSaveAs = false) {
    if (!this.desktop) { this.notify({ tone: "warning", text: "浏览器预览不支持本地项目保存" }); return; }
    const scope = this.session.captureProject();
    try {
      const document = this.canvas.flush();
      this.cancelTimer();
      this.update({ saveState: "saving" });
      if (this.state.projectPath && !forceSaveAs) await this.write(this.state.projectPath, document);
      else {
        await this.writes;
        const result = await this.desktop.saveProjectAs({ suggestedName: document.name,
          sourceProjectPath: this.state.projectPath, document });
        scope.assertCurrent();
        if (!result) { this.scheduleSave(); this.update({ saveState: this.lastSaved === document ? "saved" : "saving" }); return; }
        this.update({ projectPath: result.projectPath });
        this.lastSaved = document;
        // Edits made while the save dialog was open also reach the chosen destination.
        const latest = this.canvas.flush();
        if (latest !== document) await this.write(result.projectPath, latest);
        else this.update({ saveState: "saved" });
      }
      scope.assertCurrent();
      this.notify({ tone: "success", text: "项目与素材已安全保存，可整体移动到其他电脑" });
    } catch (error) { if (scope.isCurrent()) this.fail("保存", error); }
  }
  private fail(action: string, error: unknown) {
    const text = `${action}失败：${error instanceof Error ? error.message : String(error)}`;
    this.update({ startupError: text, saveState: "error" });
    this.notify({ tone: "danger", text });
  }
}
