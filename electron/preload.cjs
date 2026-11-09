const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("easydrawDesktop", {
  setLocale: (locale) => ipcRenderer.invoke("easydraw:locale:set", locale),
  openProject: (projectPath) => ipcRenderer.invoke("easydraw:project:open", projectPath),
  onOpenProjectFile: (listener) => {
    const handler = (_event, projectPath) => listener(projectPath);
    ipcRenderer.on("easydraw:project:open-file", handler);
    ipcRenderer.send("easydraw:project:renderer-ready");
    return () => ipcRenderer.removeListener("easydraw:project:open-file", handler);
  },
  saveProjectAs: (payload) =>
    ipcRenderer.invoke("easydraw:project:save-as", payload),
  saveProject: (payload) =>
    ipcRenderer.invoke("easydraw:project:save", payload),
  importAsset: (payload) =>
    ipcRenderer.invoke("easydraw:asset:import", payload),
  importClipboardAsset: (payload) =>
    ipcRenderer.invoke("easydraw:asset:clipboard", payload),
  readAsset: (payload) =>
    ipcRenderer.invoke("easydraw:asset:read", payload),
  resolveIconDescriptions: (payload) =>
    ipcRenderer.invoke("easydraw:icons:resolve-descriptions", payload),
  listIconLibrary: () =>
    ipcRenderer.invoke("easydraw:icons:list"),
  readIconLibraryIcon: (payload) =>
    ipcRenderer.invoke("easydraw:icons:preview", payload),
  insertIconLibraryIcon: (payload) =>
    ipcRenderer.invoke("easydraw:icons:insert", payload),
  insertIconLibraryIcons: (payload) =>
    ipcRenderer.invoke("easydraw:icons:insert-many", payload),
  readImagePlaceholder: (payload) => ipcRenderer.invoke("easydraw:placeholder:read", payload),
  insertImagePlaceholder: (payload) =>
    ipcRenderer.invoke("easydraw:placeholder:insert", payload),
  savePng: (payload) =>
    ipcRenderer.invoke("easydraw:export:save-png", payload),
  savePages: (pages) =>
    ipcRenderer.invoke("easydraw:export:save-pages", pages),
  copyPng: (data) => ipcRenderer.invoke("easydraw:export:copy-png", data),
  getMcpRuntimeStatus: () =>
    ipcRenderer.invoke("easydraw:mcp:runtime-status"),
  onMcpRuntimeStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on("easydraw:mcp:runtime-status", handler);
    return () =>
      ipcRenderer.removeListener("easydraw:mcp:runtime-status", handler);
  },
  onMcpRequest: (listener) => {
    const handler = (_event, request) => listener(request);
    ipcRenderer.on("easydraw:mcp:request", handler);
    return () => ipcRenderer.removeListener("easydraw:mcp:request", handler);
  },
  sendMcpResponse: (response) =>
    ipcRenderer.send("easydraw:mcp:response", response),
  setMcpEnabled: (enabled) => ipcRenderer.invoke("easydraw:mcp:set-enabled", enabled),
  getMcpConnectionInfo: () => ipcRenderer.invoke("easydraw:mcp:connection-info"),
  copyMcpConnectionInfo: text => ipcRenderer.invoke("easydraw:mcp:copy-connection-info", text),
  copySkillDirectory: () => ipcRenderer.invoke("easydraw:skills:copy-directory"),
  updateSkills: () => ipcRenderer.invoke("easydraw:skills:update"),
  // Self-hosted sharing: the token and share keys stay in the main process.
  getShareSettings: () => ipcRenderer.invoke("easydraw:share:get-settings"),
  setShareSettings: (payload) => ipcRenderer.invoke("easydraw:share:set-settings", payload),
  testShareServer: () => ipcRenderer.invoke("easydraw:share:test"),
  getShareStatus: (payload) => ipcRenderer.invoke("easydraw:share:status", payload),
  publishShare: (payload) => ipcRenderer.invoke("easydraw:share:publish", payload),
  setShareEnabled: (payload) => ipcRenderer.invoke("easydraw:share:set-enabled", payload),
  setShareExpiry: (payload) => ipcRenderer.invoke("easydraw:share:set-expiry", payload),
  deleteShare: (payload) => ipcRenderer.invoke("easydraw:share:delete", payload),
  copyShareLink: (payload) => ipcRenderer.invoke("easydraw:share:copy-link", payload),
  onMenuCommand: (listener) => {
    const handler = (_event, command) => listener(command);
    ipcRenderer.on("easydraw:menu-command", handler);
    return () => ipcRenderer.removeListener("easydraw:menu-command", handler);
  },
});
