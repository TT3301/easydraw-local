const { installApplicationMenu } = require("./application-menu.cjs");
const path = require("node:path");
const fsSync = require("node:fs");
const { McpService } = require("./mcp-service.cjs");
const { getMcpConnectionInfo } = require("./mcp-connection-info.cjs");
const { hashSkillDirectory } = require("./skill-content.cjs");
const { registerMcpHandlers } = require("./mcp-ipc.cjs");
const { installBundledSkill } = require("./skill-installation.cjs");
const {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  shell,
  clipboard,
  net,
  safeStorage,
} = require("electron");

const PRODUCT_NAME = "EasyDraw Local";
const APP_ICON_PATH = path.join(__dirname, "..", "build", "icon.png");

app.setName(PRODUCT_NAME);

const DEVELOPMENT_URL =
  process.env.EASYDRAW_DEVELOPMENT_URL || "http://127.0.0.1:1420";
const runAsMcpServer = process.argv.includes("--mcp-server");
const smokeTestMode = !app.isPackaged && process.env.EASYDRAW_SMOKE_TEST === "1";
const isolatedLiveSmokeMode = !app.isPackaged && process.env.EASYDRAW_LIVE_SMOKE === "1";
let currentLocale = "zh-CN";
const localeText = (chinese, english) =>
  currentLocale === "en" ? english : chinese;
const smokeUserData =
  smokeTestMode || isolatedLiveSmokeMode
    ? path.join(app.getPath("temp"), `easydraw-smoke-${process.pid}`)
    : null;
const smokeProjectPath = smokeUserData
  ? path.join(app.getPath("temp"), `easydraw-project-smoke-${process.pid}.edw`)
    : null;

if (smokeUserData) {
  app.setPath("userData", smokeUserData);
  app.once("will-quit", () => {
    fsSync.rmSync(smokeUserData, { recursive: true, force: true });
    if (smokeProjectPath) {
      fsSync.rmSync(smokeProjectPath, { recursive: true, force: true });
    }
  });
}

let mainWindow = null;
let mcpService = null;
let projectOpen = null;

const mcpDescriptorPath = () =>
  path.join(app.getPath("userData"), "mcp-bridge.json");

let skillContentHash = null;
const mcpConnectionInfo = async () => {
  const info = getMcpConnectionInfo({ app, descriptorPath: mcpDescriptorPath() });
  skillContentHash ??= hashSkillDirectory(info.skillPath);
  // An unreadable optional Skill must not block MCP connection setup.
  return { ...info, skillHash: await skillContentHash.catch(() => undefined) };
};

const sendMcpRuntimeStatus = (status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("easydraw:mcp:runtime-status", status);
  }
};

const initializeMcpService = async () => {
  mcpService = new McpService({
    settingsPath: path.join(app.getPath("userData"), "mcp-settings.json"),
    descriptorPath: mcpDescriptorPath(),
    appVersion: app.getVersion(),
    onRequest: async (request) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error("EasyDraw 主窗口尚未就绪");
      }
      mainWindow.webContents.send("easydraw:mcp:request", request);
    },
    onStatusChange: sendMcpRuntimeStatus,
  });
  await mcpService.initialize();
};

const windowForEvent = (event) =>
  BrowserWindow.fromWebContents(event.sender) ?? undefined;

const projectStorage = require("./project-storage.cjs").createProjectStorage({
  localeText, windowForEvent, smokeProjectPath,
});
app.once("will-quit", () => projectStorage.dispose());
const { resolveAssetPath } = projectStorage;

const registerDesktopHandlers = () => {
  projectStorage.register(ipcMain);
  require("./asset-service.cjs").registerAssetHandlers(ipcMain, { resolveAssetPath, localeText, windowForEvent });
  require("./export-service.cjs").registerExportHandlers(ipcMain, { localeText, windowForEvent, smokeUserData });
  require("./share-service.cjs").createShareService({
    userDataPath: app.getPath("userData"), safeStorage, fetch: net.fetch, clipboard, resolveAssetPath, localeText,
    isTrusted: event => Boolean(mainWindow) && event.sender === mainWindow.webContents,
  }).register(ipcMain);
  ipcMain.handle("easydraw:locale:set", async (_event, locale) => {
    currentLocale = locale === "en" ? "en" : "zh-CN";
    if (mainWindow && !mainWindow.isDestroyed()) {
      installApplicationMenu(mainWindow, localeText);
    }
    return true;
  });
  ipcMain.on("easydraw:mcp:response", (event, response) => {
    if (
      mainWindow &&
      event.sender === mainWindow.webContents &&
      mcpService
    ) {
      mcpService.handleRendererResponse(response);
    }
  });
  registerMcpHandlers(ipcMain, {
    service: () => mcpService,
    getConnectionInfo: mcpConnectionInfo,
    clipboard,
    isTrusted: event => mainWindow && event.sender === mainWindow.webContents,
    updateSkill: async () => {
      try {
        const { skillPath } = await mcpConnectionInfo();
        await installBundledSkill({ source: skillPath, destination: path.join(app.getPath("home"), ".agents", "skills", "easydraw-product-sketch") });
        return true;
      } catch { return false; }
    },
  });

};

function createMainWindow() {
  const compactCapture =
    process.env.EASYDRAW_CAPTURE_ICONS;
  mainWindow = new BrowserWindow({
    title: PRODUCT_NAME,
    icon: APP_ICON_PATH,
    width: compactCapture ? 1000 : 1440,
    height: compactCapture ? 620 : 920,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#eef0f3",
    show:
      (!smokeTestMode &&
        !isolatedLiveSmokeMode) ||
      Boolean(
        process.env.EASYDRAW_CAPTURE_BASELINE ||
          process.env.EASYDRAW_CAPTURE_ICONS ||
          process.env.EASYDRAW_CAPTURE_STROKE,
      ),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  if (smokeTestMode || isolatedLiveSmokeMode) {
    require("../tests/desktop/smoke.cjs").attachDiagnostics(mainWindow);
  }
  installApplicationMenu(mainWindow, localeText);
  mainWindow.on("closed", () => {
    mcpService?.setRendererReady(false);
    projectOpen?.reset();
    mainWindow = null;
  });
  mainWindow.webContents.on("did-start-loading", () => projectOpen?.reset());

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl) => {
      console.error(
        `EasyDraw renderer failed to load (${errorCode}): ${errorDescription} - ${validatedUrl}`,
      );
    },
  );

  mainWindow.webContents.on("did-finish-load", async () => {
    mcpService?.setRendererReady(true);
    if (smokeTestMode || isolatedLiveSmokeMode) {
      await require("../tests/desktop/smoke.cjs").runDesktopSmoke({
        mainWindow, smokeUserData, isolatedLiveSmokeMode,
      });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (app.isPackaged) {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  } else {
    void mainWindow.loadURL(DEVELOPMENT_URL);
    if (process.env.EASYDRAW_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  }
}

const startPackagedMcpServer = async () => {
  await app.whenReady();
  app.dock?.hide();
  process.env.EASYDRAW_BRIDGE_DESCRIPTOR =
    process.env.EASYDRAW_BRIDGE_DESCRIPTOR || mcpDescriptorPath();
  const entryPath = path.join(
    __dirname,
    "..",
    "dist-mcp",
    "mcp-server.cjs",
  );
  require(entryPath);
};

if (runAsMcpServer) {
  void startPackagedMcpServer().catch((error) => {
    console.error("EasyDraw MCP Server 启动失败", error);
    app.exit(1);
  });
} else if (app.requestSingleInstanceLock()) {
  projectOpen = require("./project-open.cjs").registerProjectOpen({
    app, ipcMain, getWindow: () => mainWindow, createWindow: createMainWindow,
  });
  void app.whenReady().then(async () => {
    if (process.platform === "darwin" && fsSync.existsSync(APP_ICON_PATH)) {
      app.dock.setIcon(nativeImage.createFromPath(APP_ICON_PATH));
    }
    registerDesktopHandlers();
    try {
      await initializeMcpService();
    } catch {
      console.error("EasyDraw MCP service could not be initialized");
    }
    createMainWindow();
    projectOpen.start();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
} else {
  app.quit();
}

app.on("window-all-closed", () => {
  if (!runAsMcpServer && process.platform !== "darwin") app.quit();
});

let mcpStoppedForQuit = false;
app.on("before-quit", event => {
  if (!mcpService || mcpStoppedForQuit) return;
  event.preventDefault();
  mcpStoppedForQuit = true;
  void mcpService.stop().catch(() => {}).finally(() => app.quit());
});
