exports.registerMcpHandlers = (ipcMain, { service, getConnectionInfo, clipboard, isTrusted, updateSkill }) => {
  const assertSender = event => {
    if (!isTrusted(event)) throw new Error("MCP 请求来源无效。");
  };
  ipcMain.handle("easydraw:mcp:runtime-status", event => {
    assertSender(event);
    return service().getStatus();
  });
  ipcMain.handle("easydraw:mcp:set-enabled", (event, enabled) => {
    assertSender(event);
    return service().setEnabled(enabled);
  });
  ipcMain.handle("easydraw:mcp:connection-info", event => {
    assertSender(event);
    return getConnectionInfo();
  });
  ipcMain.handle("easydraw:mcp:copy-connection-info", (event, text) => {
    assertSender(event);
    if (typeof text !== "string" || !text.trim() || text.length > 65_536) throw new Error("MCP 接入指南内容无效。");
    clipboard.writeText(text);
    return true;
  });
  ipcMain.handle("easydraw:skills:copy-directory", event => {
    assertSender(event);
    return Promise.resolve(getConnectionInfo()).then(info => {
      clipboard.writeText(info.skillPath);
      return true;
    });
  });
  ipcMain.handle("easydraw:skills:update", event => {
    assertSender(event);
    return updateSkill();
  });
};
