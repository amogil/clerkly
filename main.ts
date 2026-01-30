// Requirements: E.P.1, E.P.2, E.P.3, E.P.6, E.T.4, E.S.1, E.A.3, E.A.4, E.A.6, E.A.7, E.A.8, E.A.11, E.A.12, E.A.13, E.A.14, E.A.15, E.I.1, E.Q.1
// Tooling requirements: E.T.1 (see package.json)
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import Database from "better-sqlite3";
import http from "http";
import path from "path";

import { authGoogleConfig, getGoogleAuthUrl } from "./src/auth/auth_google";
import { clearTokens, readTokens, type OAuthTokens, writeTokens } from "./src/auth/token_store";
import { ensureDatabase } from "./src/db";
import { logError } from "./src/logging/logger";

type AuthResult = {
  success: boolean;
  error?: string;
};

const PROTOCOL = "clerkly";

let mainWindow: BrowserWindow | null = null;
let pendingAuthResult: AuthResult | null = null;
let authServer: http.Server | null = null;
let authServerPort: number | null = null;
let authRefreshTimer: NodeJS.Timeout | null = null;

type SqliteDatabase = InstanceType<typeof Database>;

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

const scheduleTokenRefresh = (db: SqliteDatabase, rootDir: string, tokens: OAuthTokens): void => {
  const refreshToken = tokens.refreshToken;
  if (!refreshToken) {
    return;
  }

  if (authRefreshTimer) {
    clearTimeout(authRefreshTimer);
  }

  const refreshInMs = Math.max(tokens.expiresAt - Date.now() - 60_000, 10_000);
  authRefreshTimer = setTimeout(() => {
    void refreshTokens(db, rootDir, refreshToken);
  }, refreshInMs);
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

const exchangeCodeForTokens = async (
  code: string,
  port: number
): Promise<OAuthTokens> => {
  const body = new URLSearchParams({
    code,
    client_id: authGoogleConfig.clientId,
    redirect_uri: `http://127.0.0.1:${port}/auth/callback`,
    grant_type: "authorization_code",
  });

  const response = await fetch(authGoogleConfig.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const json = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
};

const refreshTokens = async (
  db: SqliteDatabase,
  rootDir: string,
  refreshToken: string
): Promise<void> => {
  try {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: authGoogleConfig.clientId,
      grant_type: "refresh_token",
    });

    const response = await fetch(authGoogleConfig.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token refresh failed: ${text}`);
    }

    const json = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    const tokens: OAuthTokens = {
      accessToken: json.access_token,
      refreshToken,
      expiresAt: Date.now() + json.expires_in * 1000,
    };

    writeTokens(db, rootDir, tokens);
    scheduleTokenRefresh(db, rootDir, tokens);
    sendAuthResultToRenderer({ success: true });
  } catch (error) {
    logError(rootDir, "Silent token refresh failed.", error);
    sendAuthResultToRenderer({
      success: false,
      error: "Authorization refresh failed. Please sign in again.",
    });
  }
};

const startAuthServer = (db: SqliteDatabase, rootDir: string): Promise<number> => {
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

      if (code) {
        exchangeCodeForTokens(code, authServerPort)
          .then((tokens) => {
            writeTokens(db, rootDir, tokens);
            scheduleTokenRefresh(db, rootDir, tokens);
            sendAuthResultToRenderer({ success: true });
          })
          .catch((exchangeError) => {
            logError(rootDir, "Token exchange failed.", exchangeError);
            sendAuthResultToRenderer({
              success: false,
              error: "Authorization failed. Please try again.",
            });
          })
          .finally(() => {
            closeAuthServer();
          });
      } else {
        sendAuthResultToRenderer({
          success: false,
          error: error || "Authorization failed. Please try again.",
        });
        closeAuthServer();
      }

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

const registerAuthHandlers = (db: SqliteDatabase, rootDir: string): void => {
  ipcMain.handle("auth:open-google", async () => {
    try {
      const clientId = authGoogleConfig.clientId.trim();

      if (clientId.length === 0) {
        return {
          success: false,
          error: "Google OAuth client is not configured.",
        };
      }

      const port = await startAuthServer(db, rootDir);
      await shell.openExternal(getGoogleAuthUrl(clientId, port));
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  });

  ipcMain.handle("auth:get-state", () => {
    const tokens = readTokens(db, rootDir);
    if (!tokens) {
      return { authorized: false };
    }

    if (tokens.expiresAt > Date.now() + 60_000) {
      scheduleTokenRefresh(db, rootDir, tokens);
      return { authorized: true };
    }

    if (tokens.refreshToken) {
      void refreshTokens(db, rootDir, tokens.refreshToken);
      return { authorized: false };
    }

    return { authorized: false };
  });

  ipcMain.handle("auth:sign-out", () => {
    clearTokens(db, rootDir);
    sendAuthResultToRenderer({ success: false, error: "Signed out." });
    return { success: true };
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
  const rootDir = app.getPath("userData");
  let db: SqliteDatabase;

  try {
    ensureDatabase();
    db = new Database(path.join(rootDir, "clerkly.sqlite3"));
  } catch (error) {
    logError(rootDir, "Database migration failed.", error);
    dialog.showErrorBox("Database Error", "Database migration failed. The app will now exit.");
    app.exit(1);
    return;
  }

  registerAuthHandlers(db, rootDir);
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
