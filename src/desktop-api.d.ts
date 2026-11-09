import type { ProjectAsset, ProjectDocument } from "./core/protocol";
import type { StoredProjectDocument } from "@easydraw/document-model";
import type {
  BridgeRequest,
  BridgeResponse,
  McpRuntimeStatus,
  McpConnectionInfo,
} from "./core/mcp-bridge";
import type { AppLocale } from "./core/i18n";

interface ProjectOpenResult {
  projectPath: string;
  document: unknown;
}

export interface IconLibraryIcon {
  id: string;
  name: string;
  fileName: string;
  group: string;
  tags: string[];
  relativePath: string;
  width: number;
  height: number;
  size: number;
}

export interface IconLibrarySnapshot {
  configured: boolean;
  rootName: string;
  source: string | null;
  license: string | null;
  website: string | null;
  groups: string[];
  skipped: number;
  truncated: boolean;
  icons: IconLibraryIcon[];
}

export interface InsertedAssetResult {
  asset: ProjectAsset;
  data: string;
  copied: boolean;
}

export interface ShareSettings { serverUrl: string; hasToken: boolean }
export interface ShareView { link: string; size: number; updatedAt: string; enabled: boolean; expiresAt: string | null }
export interface ShareStatus { configured: boolean; serverUrl: string; share: ShareView | null; error?: string }
/** 7 or 30 days; null keeps the share until it is deleted. */
export type ShareExpiryDays = 7 | 30 | null;

export interface DesktopApi {
  setLocale(locale: AppLocale): Promise<boolean>;
  onMenuCommand(
    listener: (
      command:
        | "new-project"
        | "open-project"
        | "save-project"
        | "save-project-as"
        | "open-settings",
    ) => void,
  ): () => void;
  openProject(projectPath?: string): Promise<ProjectOpenResult | null>;
  onOpenProjectFile(listener: (projectPath: string) => void): () => void;
  saveProjectAs(payload: {
    suggestedName: string;
    sourceProjectPath: string | null;
    document: ProjectDocument;
  }): Promise<{ projectPath: string } | null>;
  saveProject(payload: {
    projectPath: string;
    document: ProjectDocument;
  }): Promise<{ projectPath: string }>;
  importAsset(payload: {
    projectPath: string | null;
  }): Promise<InsertedAssetResult | null>;
  importClipboardAsset(payload: {
    projectPath: string | null;
    data: string;
    mimeType: string;
    fileName?: string;
  }): Promise<InsertedAssetResult>;
  readAsset(payload: {
    projectPath: string | null;
    relativePath: string;
  }): Promise<{ data: string }>;
  resolveIconDescriptions(payload: { descriptions: string[] }): Promise<Array<{ description: string; id: string; name: string; assetRef: string }>>;
  listIconLibrary(): Promise<IconLibrarySnapshot>;
  readIconLibraryIcon(payload: {
    iconId: string;
  }): Promise<{ data: string; mimeType: string }>;
  insertIconLibraryIcon(payload: {
    iconId: string;
    projectPath: string | null;
  }): Promise<InsertedAssetResult>;
  insertIconLibraryIcons(payload: {
    iconIds: string[];
    projectPath: string | null;
  }): Promise<Array<{ iconId: string } & InsertedAssetResult>>;
  readImagePlaceholder(payload?: { variant?: "logo" | "wireframe" }): Promise<{ data: string; mimeType: string }>;
  insertImagePlaceholder(payload: {
    variant?: "logo" | "wireframe";
    projectPath: string | null;
  }): Promise<InsertedAssetResult>;
  savePng(payload: {
    suggestedName: string;
    data: string;
  }): Promise<{ filePath: string } | null>;
  savePages(
    pages: Array<{ fileName: string; data: string }>,
  ): Promise<{ directory: string; filePaths: string[] } | null>;
  copyPng(data: string): Promise<boolean>;
  getMcpRuntimeStatus(): Promise<McpRuntimeStatus>;
  onMcpRuntimeStatus(
    listener: (status: McpRuntimeStatus) => void,
  ): () => void;
  onMcpRequest(listener: (request: BridgeRequest) => void): () => void;
  sendMcpResponse(response: BridgeResponse): void;
  setMcpEnabled(enabled: boolean): Promise<McpRuntimeStatus>;
  getMcpConnectionInfo(): Promise<McpConnectionInfo>;
  copyMcpConnectionInfo(text: string): Promise<boolean>;
  copySkillDirectory(): Promise<boolean>;
  getShareSettings(): Promise<ShareSettings>;
  /** token: string replaces, null clears, omitted keeps the saved token. */
  setShareSettings(payload: { serverUrl: string; token?: string | null }): Promise<ShareSettings>;
  testShareServer(): Promise<{ ok: true; maxBytes: number }>;
  getShareStatus(payload: { projectId: string }): Promise<ShareStatus>;
  publishShare(payload: { projectPath: string | null; document: StoredProjectDocument; expiresInDays?: ShareExpiryDays }): Promise<ShareView>;
  setShareEnabled(payload: { projectId: string; enabled: boolean }): Promise<ShareView>;
  setShareExpiry(payload: { projectId: string; expiresInDays: ShareExpiryDays }): Promise<ShareView>;
  deleteShare(payload: { projectId: string }): Promise<null>;
  copyShareLink(payload: { projectId: string }): Promise<boolean>;
  updateSkills(): Promise<boolean>;
}

declare global {
  interface Window {
    easydrawDesktop?: DesktopApi;
  }
}

export {};
