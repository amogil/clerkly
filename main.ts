// Requirements: E.P.1, E.P.2, E.P.3, E.P.6, E.T.4, E.S.1, E.A.3, E.I.1
// Tooling requirements: E.T.1 (see package.json)
import { app, BrowserWindow, ipcMain, shell } from "electron";
import http from "http";
import path from "path";

import { authGoogleConfig, getGoogleAuthUrl } from "./src/auth/auth_google";
import { ensureDatabase } from "./src/db";

type AuthResult = {
  success: boolean;
  error?: string;
};

const PROTOCOL = "clerkly";

let mainWindow: BrowserWindow | null = null;
let pendingAuthResult: AuthResult | null = null;
let authServer: http.Server | null = null;
let authServerPort: number | null = null;

const sendAuthResultToRenderer = (result: AuthResult): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("auth:result", result);
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    return;
  }

  pendingAuthResult = result;
};

const handleAuthCallbackUrl = (callbackUrl: string): void => {
  try {
    const url = new URL(callbackUrl);
    if (url.protocol !== `${PROTOCOL}:` || url.hostname !== "auth") {
      return;
    }

    const error = url.searchParams.get("error") ?? undefined;
    const code = url.searchParams.get("code");
    const success = url.searchParams.get("success") === "1" || Boolean(code);

    sendAuthResultToRenderer({
      success,
      error: success ? undefined : error || "Authorization failed. Please try again.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid auth callback.";
    sendAuthResultToRenderer({ success: false, error: message });
  }
};

const closeAuthServer = (): void => {
  if (authServer) {
    authServer.close();
    authServer = null;
    authServerPort = null;
  }
};

const startAuthServer = (): Promise<number> => {
  closeAuthServer();

  return new Promise((resolve, reject) => {
    authServer = http.createServer((req, res) => {
      if (!req.url || authServerPort === null) {
        res.writeHead(400);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://127.0.0.1:${authServerPort}`);
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<html><body><h3>Authorization complete.</h3><p>You can close this window.</p></body></html>"
      );

      sendAuthResultToRenderer({
        success: Boolean(code),
        error: code ? undefined : error || "Authorization failed. Please try again.",
      });

      closeAuthServer();
    });

    authServer.listen(0, "127.0.0.1", () => {
      const address = authServer?.address();
      if (address && typeof address === "object") {
        authServerPort = address.port;
        resolve(address.port);
      } else {
        reject(new Error("Failed to allocate auth callback port."));
      }
    });
  });
};

const registerProtocolHandling = (): void => {
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(PROTOCOL);
    return;
  }

  const appPath = path.resolve(process.argv[1]);
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [appPath]);
};

const registerAuthHandlers = (): void => {
  ipcMain.handle("auth:open-google", async () => {
    try {
      const clientId = authGoogleConfig.clientId?.trim();

      if (!clientId) {
        return {
          success: false,
          error: "Google OAuth client is not configured.",
        };
      }

      const port = await startAuthServer();
      await shell.openExternal(getGoogleAuthUrl(clientId, port));
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  });
};

const createMainWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    title: "Clerkly",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  // Requirement: E.P.3
  mainWindow.maximize();

  if (pendingAuthResult) {
    sendAuthResultToRenderer(pendingAuthResult);
    pendingAuthResult = null;
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deepLink = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (deepLink) {
      handleAuthCallbackUrl(deepLink);
    }

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  registerAuthHandlers();
  ensureDatabase();
  registerProtocolHandling();
  createMainWindow();

  const deepLink = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
  if (deepLink) {
    handleAuthCallbackUrl(deepLink);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleAuthCallbackUrl(url);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
