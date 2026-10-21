import type { ProjectAsset, ProjectDocument } from "./core/protocol";
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
  updateSkills(): Promise<boolean>;
}

declare global {
  interface Window {
    easydrawDesktop?: DesktopApi;
  }
}

export {};
