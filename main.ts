// Requirements: E.G.1, E.G.2, E.G.3, E.G.9, E.G.10, E.G.11, E.G.13, E.G.16, E.G.19
// Tooling requirements: E.G.6, E.G.7, E.G.8 (see package.json)
import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";

import { ensureDatabase } from "./src/db";

const registerAuthHandlers = (): void => {
  ipcMain.handle("auth:open-google", async () => {
    try {
      await shell.openExternal("https://accounts.google.com/");
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  });
};

const createMainWindow = (): void => {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    title: "Clerkly",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  // Requirement: E.G.9
  win.maximize();
};

app.whenReady().then(() => {
  registerAuthHandlers();
  ensureDatabase();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
