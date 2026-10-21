const { Menu } = require("electron");
exports.installApplicationMenu = (mainWindow, localeText) => {
const sendMenuCommand = (window, command) => {
  if (!window.isDestroyed()) {
    window.webContents.send("easydraw:menu-command", command);
  }
};

const installApplicationMenu = (mainWindow) => {
  const menu = Menu.buildFromTemplate([
    {
      label: localeText("文件", "File"),
      submenu: [
        {
          label: localeText("新建项目", "New project"),
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuCommand(mainWindow, "new-project"),
        },
        {
          label: localeText("打开项目", "Open project"),
          accelerator: "CmdOrCtrl+O",
          click: () => sendMenuCommand(mainWindow, "open-project"),
        },
        { type: "separator" },
        {
          label: localeText("保存项目", "Save project"),
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuCommand(mainWindow, "save-project"),
        },
        {
          label: localeText("另存项目", "Save project as"),
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendMenuCommand(mainWindow, "save-project-as"),
        },
        { type: "separator" },
        {
          label: localeText("设置…", "Settings…"),
          click: () => sendMenuCommand(mainWindow, "open-settings"),
        },
      ],
    },
    {
      label: localeText("编辑", "Edit"),
      submenu: [
        { role: "undo", label: localeText("撤销", "Undo") },
        { role: "redo", label: localeText("重做", "Redo") },
        { type: "separator" },
        { role: "cut", label: localeText("剪切", "Cut") },
        { role: "copy", label: localeText("复制", "Copy") },
        { role: "paste", label: localeText("粘贴", "Paste") },
        { role: "selectAll", label: localeText("全选", "Select all") },
      ],
    },
    {
      label: localeText("视图", "View"),
      submenu: [
        { role: "reload", label: localeText("重新加载", "Reload") },
        { role: "forceReload", label: localeText("强制重新加载", "Force reload") },
        { type: "separator" },
        { role: "resetZoom", label: localeText("实际大小", "Actual size") },
        { role: "zoomIn", label: localeText("放大", "Zoom in") },
        { role: "zoomOut", label: localeText("缩小", "Zoom out") },
        { type: "separator" },
        { role: "togglefullscreen", label: localeText("切换全屏", "Toggle full screen") },
      ],
    },
    {
      label: localeText("窗口", "Window"),
      role: "windowMenu",
    },
  ]);
  Menu.setApplicationMenu(menu);
};


installApplicationMenu(mainWindow);
};
