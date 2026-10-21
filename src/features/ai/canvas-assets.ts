import type { CanvasOperation } from "@easydraw/editor-contracts";
import type { ProjectAsset } from "../../core/protocol";
import { vectorDataFromInsertedAsset } from "../assets/inserted-asset";
import type { EditorRequestPorts } from "./request-ports";
import type { InsertedAssetResult } from "../../desktop-api";
import { fail, type ResolvedAsset } from "../../core/canvas-commands";
export const PLACEHOLDER_REF = "builtin:placeholder:image-logo";
const LEGACY_PLACEHOLDER_REF = "builtin:placeholder:image-wireframe";
const isPlaceholder = (ref: string) => ref === PLACEHOLDER_REF || ref === LEGACY_PLACEHOLDER_REF;
const placeholderVariant = (ref: string) => ref === LEGACY_PLACEHOLDER_REF ? "wireframe" as const : "logo" as const;
export class CanvasAssets {
  private staged = new Map<string, InsertedAssetResult>();
  private prepared = new Map<string, InsertedAssetResult>();
  preloadCommitted(refs: string[]) {
    this.ports.preloadAssets([...new Set(refs)].flatMap(ref => this.prepared.has(ref) ? [this.prepared.get(ref)!] : []));
  }
  constructor(private ports: EditorRequestPorts) {}
  private publicAsset(asset: ProjectAsset, assetRef: string) {
    const { relativePath: _path, ...metadata } = asset;
    return { ...metadata, assetRef, source: "document", category: asset.kind === "svg" ? "vector" : "image", format: asset.kind === "svg" ? "vector" : "raster" };
  }
  async selectIcons(operations: CanvasOperation[]) {
    const descriptions = [...new Set(operations.flatMap(op => (op.op === "create" || op.op === "update") && op.iconDescription ? [op.iconDescription] : []))];
    const iconSelections = descriptions.length ? await this.ports.desktop.resolveIconDescriptions({ descriptions }) : [];
    const refs = new Map(iconSelections.map(icon => [icon.description, icon.assetRef]));
    return { iconSelections, operations: operations.map(op => {
      if ((op.op !== "create" && op.op !== "update") || !op.iconDescription) return op;
      const { iconDescription, ...native } = op;
      const assetRef = refs.get(iconDescription) ?? fail("ICON_SELECTION_FAILED", "No icon returned for description");
      if (!assetRef.startsWith("builtin:icon:")) fail("ICON_SELECTION_FAILED", "Invalid icon selection");
      return { ...native, assetRef };
    }) };
  }
  async search(input: { sources: Array<"document" | "builtin">; query: string; category?: string; format?: string; offset: number; limit: number }) {
    const query = input.query.toLowerCase();
    const items: Array<Record<string, any>> = [];
    if (input.sources.includes("document")) {
      const document = this.ports.controller.getSnapshot().document;
      items.push(...document.assets.map(a => this.publicAsset(a, `document:${a.id}`)));
    }
    if (input.sources.includes("builtin")) {
      const library = await this.ports.desktop.listIconLibrary();
      items.push(...library.icons.map(icon => ({ assetRef: `builtin:icon:${icon.id}`, source: "builtin", category: "icon", format: "vector", name: icon.name, tags: icon.tags, width: icon.width, height: icon.height, license: library.license, group: icon.group })));
      items.push({ assetRef: PLACEHOLDER_REF, source: "builtin", category: "placeholder", format: "vector", name: "Image placeholder logo", width: 24, height: 24, usage: "Place a small centered logo over a separate background shape and group both in the same apply_operations batch.", tags: ["image", "placeholder", "logo", "picture", "图片", "占位图"] });
    }
    const matches = items.filter(item => (!input.category || item.category === input.category) && (!input.format || item.format === input.format)
      && (!query || [item.name, item.fileName, item.group, ...(item.tags ?? [])].join(" ").toLowerCase().includes(query)))
      .sort((a, b) => {
        const score = (item: Record<string, any>) => {
          const name = String(item.name ?? item.fileName).toLowerCase();
          const tags = (item.tags ?? []).map((tag: string) => tag.toLowerCase());
          return name === query || name === `${query}-line` || name === `${query}-fill` ? 0
            : name.startsWith(query) ? 1 : tags.includes(query) ? 2 : name.includes(query) ? 3 : 4;
        };
        return score(a) - score(b) || String(a.name ?? a.fileName).localeCompare(String(b.name ?? b.fileName), "en");
      });
    return { sources: input.sources, total: matches.length, items: matches.slice(input.offset, input.offset + input.limit), nextOffset: input.offset + input.limit < matches.length ? input.offset + input.limit : null };
  }
  async get(assetRef: string, content: boolean): Promise<Record<string, unknown>> {
    if (isPlaceholder(assetRef)) {
      const result = content ? await this.ports.desktop.readImagePlaceholder({ variant: placeholderVariant(assetRef) }) : null;
      return { assetRef, source: "builtin", category: "placeholder", format: "vector", name: assetRef === PLACEHOLDER_REF ? "Image placeholder logo" : "Legacy image wireframe placeholder", width: assetRef === PLACEHOLDER_REF ? 24 : 180, height: assetRef === PLACEHOLDER_REF ? 24 : 184, mimeType: "image/svg+xml", ...(result ? { data: result.data, encoding: "base64" } : {}) };
    }
    if (assetRef.startsWith("builtin:icon:")) {
      const iconId = assetRef.slice("builtin:icon:".length), library = await this.ports.desktop.listIconLibrary();
      const icon = library.icons.find(i => i.id === iconId) ?? fail("ASSET_NOT_FOUND", assetRef);
      const preview = content ? await this.ports.desktop.readIconLibraryIcon({ iconId }) : null;
      return { assetRef, source: "builtin", category: "icon", format: "vector", name: icon.name, width: icon.width, height: icon.height, license: library.license,
        ...(preview ? { ...preview, encoding: "base64" } : {}) };
    }
    const staged = this.staged.get(assetRef);
    const asset = staged?.asset ?? this.ports.controller.getSnapshot().document.assets.find(a => `document:${a.id}` === assetRef) ?? fail("ASSET_NOT_FOUND", assetRef);
    const data = content ? staged?.data ?? (await this.ports.desktop.readAsset({ projectPath: this.ports.getProjectPath(), relativePath: asset.relativePath })).data : undefined;
    return { ...this.publicAsset(asset, assetRef), source: staged ? "session" : "document", ...(data ? { data, encoding: "base64" } : {}) };
  }
  async import(input: { data: string; mimeType: string; fileName: string }) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data) || input.data.length % 4 !== 0) fail("INVALID_ASSET_DATA", "Expected base64 data");
    const inserted = await this.ports.desktop.importClipboardAsset({ ...input, projectPath: this.ports.getProjectPath() });
    if (inserted.asset.kind === "svg") vectorDataFromInsertedAsset(inserted);
    const ref = `session:${inserted.asset.id}`;
    this.staged.set(ref, inserted);
    return { ...this.publicAsset(inserted.asset, ref), source: "session" };
  }
  async resolve(assetRef: string, dryRun: boolean): Promise<ResolvedAsset> {
    let inserted: InsertedAssetResult;
    if (assetRef.startsWith("builtin:")) {
      if (dryRun) {
        const preview = await this.get(assetRef, true);
        // The same SVG parser is used before persistence and before actual commit.
        const data = preview.data as string;
        const asset = { id: `preview-${assetRef}`, kind: "svg", fileName: "preview.svg", relativePath: "assets/preview.svg", mimeType: "image/svg+xml", width: 24, height: 24, size: 0, sha256: "0".repeat(64), createdAt: "" } as ProjectAsset;
        return { asset, vectorData: vectorDataFromInsertedAsset({ asset, data, copied: false }) };
      }
      inserted = isPlaceholder(assetRef)
        ? await this.ports.desktop.insertImagePlaceholder({ projectPath: this.ports.getProjectPath(), variant: placeholderVariant(assetRef) })
        : await this.ports.desktop.insertIconLibraryIcon({ iconId: assetRef.slice("builtin:icon:".length), projectPath: this.ports.getProjectPath() });
    } else {
      const staged = this.staged.get(assetRef);
      if (staged) inserted = staged;
      else {
        const asset = this.ports.controller.getSnapshot().document.assets.find(a => `document:${a.id}` === assetRef) ?? fail("ASSET_NOT_FOUND", assetRef);
        const read = await this.ports.desktop.readAsset({ projectPath: this.ports.getProjectPath(), relativePath: asset.relativePath });
        inserted = { asset, data: read.data, copied: false };
      }
    }
    if (!dryRun) this.prepared.set(assetRef, inserted);
    return { asset: inserted.asset, ...(inserted.asset.kind === "svg" ? { vectorData: vectorDataFromInsertedAsset(inserted) } : {}) };
  }
}
