const path = require("node:path");
const fs = require("node:fs/promises");
const { dialog, clipboard, nativeImage } = require("electron");
exports.registerExportHandlers = (ipcMain, { localeText, windowForEvent, smokeUserData }) => {
  ipcMain.handle(
    "easydraw:export:save-png",
    async (event, { suggestedName, data }) => {
      const result = await dialog.showSaveDialog(windowForEvent(event), {
        title: localeText("导出页面截图", "Export page capture"),
        defaultPath: suggestedName,
        buttonLabel: localeText("导出 PNG", "Export PNG"),
        filters: [{ name: localeText("PNG 图片", "PNG image"), extensions: ["png"] }],
      });
      if (result.canceled || !result.filePath) return null;
      await fs.writeFile(result.filePath, Buffer.from(data, "base64"));
      return { filePath: result.filePath };
    },
  );

  ipcMain.handle(
    "easydraw:export:save-pages",
    async (event, pages) => {
      let targetDirectory;
      if (smokeUserData) {
        targetDirectory = path.join(smokeUserData, "batch-export");
      } else {
        const result = await dialog.showOpenDialog(windowForEvent(event), {
          title: localeText("选择批量导出目录", "Choose batch export folder"),
          buttonLabel: localeText("导出全部页面", "Export all pages"),
          properties: ["openDirectory", "createDirectory"],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        [targetDirectory] = result.filePaths;
      }
      await fs.mkdir(targetDirectory, { recursive: true });
      const filePaths = [];
      for (const page of pages) {
        const fileName = path.basename(page.fileName);
        if (fileName !== page.fileName || !fileName.endsWith(".png")) {
          throw new Error("批量导出文件名无效");
        }
        const filePath = path.join(targetDirectory, fileName);
        await fs.writeFile(filePath, Buffer.from(page.data, "base64"));
        filePaths.push(filePath);
      }
      return { directory: targetDirectory, filePaths };
    },
  );

  ipcMain.handle("easydraw:export:copy-png", async (_event, data) => {
    const image = nativeImage.createFromBuffer(Buffer.from(data, "base64"));
    if (image.isEmpty()) throw new Error("无法创建剪贴板图片");
    clipboard.writeImage(image);
    return true;
  });
};
