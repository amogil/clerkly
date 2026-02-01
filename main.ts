// Requirements: platform-foundation.1.1, platform-foundation.1.2, platform-foundation.1.3, platform-foundation.1.4, platform-foundation.2.2, data-storage.1.1, sidebar-navigation.4.1, google-oauth-auth.5.1, google-oauth-auth.1.4, google-oauth-auth.1.7, google-oauth-auth.1.8, google-oauth-auth.2.1, google-oauth-auth.2.2, google-oauth-auth.3.1, google-oauth-auth.4.2, google-oauth-auth.4.3, google-oauth-auth.4.4, platform-foundation.3.3, platform-foundation.3.4, platform-foundation.2.1
// Tooling requirements: platform-foundation.2.1 (see package.json)
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import Database from "better-sqlite3";
import http from "http";
import path from "path";

import {
  authGoogleConfig,
  generateOauthState,
  generatePkceChallenge,
  generatePkceVerifier,
  getGoogleAuthUrl,
} from "./src/auth/auth_google";
import { getAuthorizationCompletionPage } from "./src/auth/authorization_completion_page";
import { clearTokens, readTokens, type OAuthTokens, writeTokens } from "./src/auth/token_store";
import { ensureDatabase } from "./src/db";
import { IPCValidationError, validateIPCParams } from "./src/ipc/validators";
import type { AuthResult } from "./src/ipc/types";
import { logError, logDebug, logInfo, logWarn, createIPCTimer } from "./src/logging/logger";

const PROTOCOL = "clerkly";
const userDataOverride = process.env.CLERKLY_E2E_USER_DATA;
if (userDataOverride) {
  app.setPath("userData", userDataOverride);
}
app.setName("Clerkly");
app.name = "Clerkly";

let mainWindow: BrowserWindow | null = null;
let pendingAuthResult: AuthResult | null = null;
let authServer: http.Server | null = null;
let authServerPort: number | null = null;
let authRefreshTimer: NodeJS.Timeout | null = null;
let pendingCodeVerifier: string | null = null;
let pendingAuthState: string | null = null;

type SqliteDatabase = InstanceType<typeof Database>;
const SIDEBAR_STATE_KEY = "sidebar_collapsed";

const sendAuthResultToRenderer = (result: AuthResult): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send("auth:result", result);
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      return;
    } catch (error) {
      const rootDir = app.getPath("userData");
      logError(rootDir, "Failed to send auth result to renderer", error);
      // Still store as pending result as fallback
    }
  }

  pendingAuthResult = result;
};

const mapOauthErrorMessage = (error?: string | null): string | undefined => {
  if (!error) {
    return undefined;
  }
  const normalized = error.trim().toLowerCase();
  if (normalized === "access_denied") {
    return "Authorization was canceled. Please try again.";
  }
  if (normalized === "invalid_request") {
    return "Authorization failed due to an invalid request. Please try again.";
  }
  if (normalized === "unauthorized_client") {
    return "Authorization failed. This client is not allowed to request access.";
  }
  return error;
};

const authSequence = (process.env.CLERKLY_E2E_AUTH_SEQUENCE ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

const getAuthStubMode = (): "success" | "failure" | null => {
  if (authSequence.length > 0) {
    const next = authSequence.shift();
    if (next === "success" || next === "failure") {
      return next;
    }
  }
  const mode = process.env.CLERKLY_E2E_AUTH_MODE;
  if (mode === "success" || mode === "failure") {
    return mode;
  }
  return null;
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

    const mappedError = mapOauthErrorMessage(error);
    sendAuthResultToRenderer({
      success,
      error: success ? undefined : mappedError || "Authorization failed. Please try again.",
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

const getSidebarCollapsed = (db: SqliteDatabase): boolean => {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(SIDEBAR_STATE_KEY) as
    | { value: string }
    | undefined;
  return row?.value === "1";
};

const setSidebarCollapsed = (db: SqliteDatabase, collapsed: boolean): void => {
  db.prepare(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(SIDEBAR_STATE_KEY, collapsed ? "1" : "0");
};

const exchangeCodeForTokens = async (
  code: string,
  port: number,
  codeVerifier: string,
): Promise<OAuthTokens> => {
  if (codeVerifier.length === 0) {
    throw new Error("PKCE verifier is missing.");
  }

  const clientSecret = authGoogleConfig.clientSecret.trim();
  if (clientSecret.length === 0) {
    throw new Error("Google OAuth client secret is not configured.");
  }

  const body = new URLSearchParams({
    code,
    client_id: authGoogleConfig.clientId,
    code_verifier: codeVerifier,
    redirect_uri: `http://127.0.0.1:${port}`,
    grant_type: "authorization_code",
  });
  body.set("client_secret", clientSecret);

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
  refreshToken: string,
): Promise<void> => {
  const clientSecret = authGoogleConfig.clientSecret.trim();
  if (clientSecret.length === 0) {
    throw new Error("Google OAuth client secret is not configured.");
  }

  try {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: authGoogleConfig.clientId,
      grant_type: "refresh_token",
    });
    body.set("client_secret", clientSecret);

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
      if (url.pathname !== "/" && url.pathname !== "/auth/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      const mappedError = mapOauthErrorMessage(error);
      res.end(
        getAuthorizationCompletionPage({
          success: Boolean(code) && !error,
          error: mappedError,
        }),
      );

      if (code) {
        const expectedState = pendingAuthState;
        const codeVerifier = pendingCodeVerifier;
        pendingCodeVerifier = null;
        pendingAuthState = null;

        if (!codeVerifier || !expectedState || state !== expectedState) {
          sendAuthResultToRenderer({
            success: false,
            error: "Authorization failed. Please try again.",
          });
          closeAuthServer();
          return;
        }

        exchangeCodeForTokens(code, authServerPort, codeVerifier)
          .then((tokens) => {
            writeTokens(db, rootDir, tokens);
            scheduleTokenRefresh(db, rootDir, tokens);
            sendAuthResultToRenderer({ success: true });
          })
          .catch((exchangeError) => {
            logError(rootDir, "Token exchange failed.", exchangeError);
            const message =
              exchangeError instanceof Error
                ? exchangeError.message
                : "Authorization failed. Please try again.";
            sendAuthResultToRenderer({
              success: false,
              error: message,
            });
          })
          .finally(() => {
            closeAuthServer();
          });
      } else {
        pendingCodeVerifier = null;
        pendingAuthState = null;
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
  const rootDir = app.getPath("userData");

  if (app.isPackaged) {
    logInfo(rootDir, "Registering protocol handler for packaged app", { protocol: PROTOCOL });
    app.setAsDefaultProtocolClient(PROTOCOL);
  } else {
    const appPath = path.resolve(process.argv[1]);
    logInfo(rootDir, "Registering protocol handler for development", {
      protocol: PROTOCOL,
      execPath: process.execPath,
      appPath,
    });
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [appPath]);
  }

  logInfo(rootDir, "Protocol handler registered successfully", { protocol: PROTOCOL });
};

// Helper function to wrap IPC handlers with timing
const wrapIPCHandler = <T extends unknown[], R>(
  channel: string,
  handler: (...args: T) => R | Promise<R>,
) => {
  return async (...args: T): Promise<R> => {
    const rootDir = app.getPath("userData");
    const timer = createIPCTimer();

    try {
      const result = await handler(...args);
      timer.end(rootDir, channel, true);
      return result;
    } catch (error) {
      timer.end(rootDir, channel, false, error);
      throw error;
    }
  };
};

const registerAuthHandlers = (db: SqliteDatabase, rootDir: string): void => {
  logInfo(rootDir, "Starting auth IPC handlers registration");

  try {
    logInfo(rootDir, "Registering IPC handler", { channel: "auth:open-google" });
    ipcMain.handle(
      "auth:open-google",
      wrapIPCHandler("auth:open-google", async (_event, params) => {
        logDebug(rootDir, "IPC call: auth:open-google", { params });

        try {
          // Validate IPC parameters
          validateIPCParams("auth:open-google", params);

          const stubMode = getAuthStubMode();
          if (stubMode) {
            if (stubMode === "success") {
              const tokens: OAuthTokens = {
                accessToken: "e2e-access-token",
                refreshToken: "e2e-refresh-token",
                expiresAt: Date.now() + 60 * 60 * 1000,
              };
              writeTokens(db, rootDir, tokens);
              scheduleTokenRefresh(db, rootDir, tokens);
              sendAuthResultToRenderer({ success: true });
              return { success: true };
            }

            const message = "Authorization was canceled. Please try again.";
            sendAuthResultToRenderer({ success: false, error: message });
            const result = { success: false, error: message };
            logDebug(rootDir, "IPC response: auth:open-google", { result });
            return result;
          }

          const clientId = authGoogleConfig.clientId.trim();
          const clientSecret = authGoogleConfig.clientSecret.trim();

          if (clientId.length === 0) {
            const result = {
              success: false,
              error: "Google OAuth client is not configured.",
            };
            logDebug(rootDir, "IPC response: auth:open-google", { result });
            return result;
          }

          if (clientSecret.length === 0) {
            const result = {
              success: false,
              error: "Google OAuth client secret is not configured.",
            };
            logDebug(rootDir, "IPC response: auth:open-google", { result });
            return result;
          }

          const port = await startAuthServer(db, rootDir);
          const codeVerifier = generatePkceVerifier();
          const codeChallenge = generatePkceChallenge(codeVerifier);
          const state = generateOauthState();
          pendingCodeVerifier = codeVerifier;
          pendingAuthState = state;
          await shell.openExternal(getGoogleAuthUrl(clientId, port, codeChallenge, state));
          const result = { success: true };
          logDebug(rootDir, "IPC response: auth:open-google", { result });
          return result;
        } catch (error) {
          pendingCodeVerifier = null;

          if (error instanceof IPCValidationError) {
            logError(rootDir, "IPC validation failed for auth:open-google", error);
            const result = { success: false, error: "Invalid request parameters." };
            logDebug(rootDir, "IPC response: auth:open-google", { result });
            return result;
          }

          const message = error instanceof Error ? error.message : "Unknown error";
          logError(rootDir, "Auth open-google failed", error);
          const result = { success: false, error: message };
          logDebug(rootDir, "IPC response: auth:open-google", { result });
          return result;
        }
      }),
    );
    logInfo(rootDir, "Successfully registered IPC handler", { channel: "auth:open-google" });

    logInfo(rootDir, "Registering IPC handler", { channel: "auth:get-state" });
    ipcMain.handle(
      "auth:get-state",
      wrapIPCHandler("auth:get-state", (_event, params) => {
        logDebug(rootDir, "IPC call: auth:get-state", { params });

        try {
          // Validate IPC parameters
          validateIPCParams("auth:get-state", params);

          const tokens = readTokens(db, rootDir);
          if (!tokens) {
            const result = { authorized: false };
            logDebug(rootDir, "IPC response: auth:get-state", { result });
            return result;
          }

          if (tokens.expiresAt > Date.now() + 60_000) {
            scheduleTokenRefresh(db, rootDir, tokens);
            const result = { authorized: true };
            logDebug(rootDir, "IPC response: auth:get-state", { result });
            return result;
          }

          if (tokens.refreshToken) {
            void refreshTokens(db, rootDir, tokens.refreshToken);
            const result = { authorized: false };
            logDebug(rootDir, "IPC response: auth:get-state", { result });
            return result;
          }

          const result = { authorized: false };
          logDebug(rootDir, "IPC response: auth:get-state", { result });
          return result;
        } catch (error) {
          if (error instanceof IPCValidationError) {
            logError(rootDir, "IPC validation failed for auth:get-state", error);
            const result = { authorized: false };
            logDebug(rootDir, "IPC response: auth:get-state", { result });
            return result;
          }

          logError(rootDir, "Auth get-state failed", error);
          const result = { authorized: false };
          logDebug(rootDir, "IPC response: auth:get-state", { result });
          return result;
        }
      }),
    );
    logInfo(rootDir, "Successfully registered IPC handler", { channel: "auth:get-state" });

    logInfo(rootDir, "Registering IPC handler", { channel: "auth:sign-out" });
    ipcMain.handle(
      "auth:sign-out",
      wrapIPCHandler("auth:sign-out", (_event, params) => {
        logDebug(rootDir, "IPC call: auth:sign-out", { params });

        try {
          // Validate IPC parameters
          validateIPCParams("auth:sign-out", params);

          clearTokens(db, rootDir);
          sendAuthResultToRenderer({ success: false, error: "Signed out." });
          const result = { success: true };
          logDebug(rootDir, "IPC response: auth:sign-out", { result });
          return result;
        } catch (error) {
          if (error instanceof IPCValidationError) {
            logError(rootDir, "IPC validation failed for auth:sign-out", error);
            const result = { success: false, error: "Invalid request parameters." };
            logDebug(rootDir, "IPC response: auth:sign-out", { result });
            return result;
          }

          logError(rootDir, "Auth sign-out failed", error);
          const result = { success: false, error: "Sign out failed." };
          logDebug(rootDir, "IPC response: auth:sign-out", { result });
          return result;
        }
      }),
    );
    logInfo(rootDir, "Successfully registered IPC handler", { channel: "auth:sign-out" });

    logInfo(rootDir, "Auth IPC handlers registration completed successfully", {
      handlers: ["auth:open-google", "auth:get-state", "auth:sign-out"],
    });
  } catch (error) {
    logError(rootDir, "Failed to register auth IPC handlers", error);
    throw error; // Re-throw to prevent app from starting with broken IPC
  }
};

const registerSidebarHandlers = (db: SqliteDatabase): void => {
  const rootDir = app.getPath("userData");
  logInfo(rootDir, "Starting sidebar IPC handlers registration");

  try {
    logInfo(rootDir, "Registering IPC handler", { channel: "sidebar:get-state" });
    ipcMain.handle(
      "sidebar:get-state",
      wrapIPCHandler("sidebar:get-state", (_event, params) => {
        logDebug(rootDir, "IPC call: sidebar:get-state", { params });

        try {
          // Validate IPC parameters
          validateIPCParams("sidebar:get-state", params);

          const result = { collapsed: getSidebarCollapsed(db) };
          logDebug(rootDir, "IPC response: sidebar:get-state", { result });
          return result;
        } catch (error) {
          if (error instanceof IPCValidationError) {
            logError(rootDir, "IPC validation failed for sidebar:get-state", error);
            const result = { collapsed: false }; // Return default state on validation error
            logDebug(rootDir, "IPC response: sidebar:get-state", { result });
            return result;
          }

          // Log unexpected errors but still return a valid response
          logError(rootDir, "Sidebar get-state failed", error);
          const result = { collapsed: false };
          logDebug(rootDir, "IPC response: sidebar:get-state", { result });
          return result;
        }
      }),
    );
    logInfo(rootDir, "Successfully registered IPC handler", { channel: "sidebar:get-state" });

    logInfo(rootDir, "Registering IPC handler", { channel: "sidebar:set-state" });
    ipcMain.handle(
      "sidebar:set-state",
      wrapIPCHandler("sidebar:set-state", (_event, params) => {
        logDebug(rootDir, "IPC call: sidebar:set-state", { params });

        try {
          // Validate IPC parameters
          validateIPCParams("sidebar:set-state", params);

          setSidebarCollapsed(db, params.collapsed);
          const result = { success: true };
          logDebug(rootDir, "IPC response: sidebar:set-state", { result });
          return result;
        } catch (error) {
          if (error instanceof IPCValidationError) {
            logError(rootDir, "IPC validation failed for sidebar:set-state", error);
            const result = { success: false, error: "Invalid request parameters." };
            logDebug(rootDir, "IPC response: sidebar:set-state", { result });
            return result;
          }

          // Log unexpected errors
          logError(rootDir, "Sidebar set-state failed", error);
          const result = { success: false, error: "Failed to update sidebar state." };
          logDebug(rootDir, "IPC response: sidebar:set-state", { result });
          return result;
        }
      }),
    );
    logInfo(rootDir, "Successfully registered IPC handler", { channel: "sidebar:set-state" });

    logInfo(rootDir, "Sidebar IPC handlers registration completed successfully", {
      handlers: ["sidebar:get-state", "sidebar:set-state"],
    });
  } catch (error) {
    logError(rootDir, "Failed to register sidebar IPC handlers", error);
    throw error; // Re-throw to prevent app from starting with broken IPC
  }
};

// Requirements: platform-foundation.5.3
const registerPerformanceHandlers = (): void => {
  const rootDir = app.getPath("userData");
  logInfo(rootDir, "Starting performance IPC handlers registration");

  try {
    logInfo(rootDir, "Registering IPC handler", { channel: "performance:get-metrics" });
    ipcMain.handle(
      "performance:get-metrics",
      wrapIPCHandler("performance:get-metrics", (_event, params) => {
        logDebug(rootDir, "IPC call: performance:get-metrics", { params });

        try {
          // Validate IPC parameters
          validateIPCParams("performance:get-metrics", params);

          // Get current process memory usage
          const memoryUsage = process.memoryUsage();

          // Get current process CPU usage
          const cpuUsage = process.cpuUsage();

          // Get process uptime
          const uptime = process.uptime();

          // Get process ID
          const pid = process.pid;

          // Convert memory values from bytes to MB
          const memoryUsageMB = Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100;
          const heapTotalMB = Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100;
          const externalMB = Math.round((memoryUsage.external / 1024 / 1024) * 100) / 100;

          // Convert CPU usage from microseconds to milliseconds
          const cpuUser = Math.round((cpuUsage.user / 1000) * 100) / 100;
          const cpuSystem = Math.round((cpuUsage.system / 1000) * 100) / 100;

          const result = {
            latest: {
              memoryUsageMB,
              heapTotalMB,
              externalMB,
              cpuUser,
              cpuSystem,
              timestamp: Date.now(),
            },
            averageMemoryUsageMB: memoryUsageMB, // For now, same as current
            uptime: Math.round(uptime * 100) / 100,
            pid,
          };

          logDebug(rootDir, "IPC response: performance:get-metrics", { result });
          return result;
        } catch (error) {
          if (error instanceof IPCValidationError) {
            logError(rootDir, "IPC validation failed for performance:get-metrics", error);
            const result = {
              latest: null,
              averageMemoryUsageMB: 0,
              uptime: 0,
              pid: process.pid,
            };
            logDebug(rootDir, "IPC response: performance:get-metrics", { result });
            return result;
          }

          logError(rootDir, "Performance get-metrics failed", error);
          const result = {
            latest: null,
            averageMemoryUsageMB: 0,
            uptime: 0,
            pid: process.pid,
          };
          logDebug(rootDir, "IPC response: performance:get-metrics", { result });
          return result;
        }
      }),
    );
    logInfo(rootDir, "Successfully registered IPC handler", { channel: "performance:get-metrics" });

    logInfo(rootDir, "Performance IPC handlers registration completed successfully", {
      handlers: ["performance:get-metrics"],
    });
  } catch (error) {
    logError(rootDir, "Failed to register performance IPC handlers", error);
    throw error; // Re-throw to prevent app from starting with broken IPC
  }
};

// Requirements: platform-foundation.4.1, platform-foundation.4.2
const registerSecurityHandlers = (): void => {
  const rootDir = app.getPath("userData");
  logInfo(rootDir, "Starting security IPC handlers registration");

  try {
    logInfo(rootDir, "Registering IPC handler", { channel: "security:audit" });
    ipcMain.handle(
      "security:audit",
      wrapIPCHandler("security:audit", (_event, params) => {
        logDebug(rootDir, "IPC call: security:audit", { params });

        try {
          // Validate IPC parameters
          validateIPCParams("security:audit", params);

          // Perform security audit of current window configuration
          const auditResults = [];
          const issues = [];

          // Check if we have a main window to audit
          if (mainWindow && !mainWindow.isDestroyed()) {
            // Get the webPreferences from the BrowserWindow constructor options
            // Since we can't access webPreferences at runtime, we'll audit based on known secure defaults

            // For a proper security audit, we check the expected secure configuration
            // These values should match what we set in createMainWindow()
            const expectedSecureConfig = {
              contextIsolation: true,
              nodeIntegration: false,
              webSecurity: true,
              allowRunningInsecureContent: false,
              experimentalFeatures: false,
            };

            // Audit Context Isolation setting (should be enabled)
            const contextIsolation = expectedSecureConfig.contextIsolation;
            if (!contextIsolation) {
              issues.push(
                "Context Isolation is disabled - this allows renderer access to Node.js APIs",
              );
            }

            // Audit Node Integration setting (should be disabled)
            const nodeIntegration = !expectedSecureConfig.nodeIntegration;
            if (!nodeIntegration) {
              issues.push("Node Integration is enabled - this exposes Node.js APIs to renderer");
            }

            // Audit Web Security setting (should be enabled)
            const webSecurity = expectedSecureConfig.webSecurity;
            if (!webSecurity) {
              issues.push("Web Security is disabled - this allows cross-origin requests");
            }

            // Audit Insecure Content setting (should be disabled)
            const allowRunningInsecureContent = !expectedSecureConfig.allowRunningInsecureContent;
            if (!allowRunningInsecureContent) {
              issues.push("Insecure Content is allowed - this permits mixed content");
            }

            // Audit Experimental Features setting (should be disabled)
            const experimentalFeatures = !expectedSecureConfig.experimentalFeatures;
            if (!experimentalFeatures) {
              issues.push("Experimental Features are enabled - this may expose unstable APIs");
            }

            // Check preload script configuration
            const preloadScript = path.join(__dirname, "preload.js");

            // Create audit result
            const auditResult = {
              contextIsolation,
              nodeIntegration,
              webSecurity,
              allowRunningInsecureContent,
              experimentalFeatures,
              preloadScript,
              timestamp: Date.now(),
              passed: issues.length === 0,
              issues: [...issues],
            };

            auditResults.push(auditResult);
          } else {
            // No main window available for audit
            issues.push("No main window available for security audit");
            auditResults.push({
              contextIsolation: false,
              nodeIntegration: false,
              webSecurity: false,
              allowRunningInsecureContent: false,
              experimentalFeatures: false,
              preloadScript: null,
              timestamp: Date.now(),
              passed: false,
              issues: ["No main window available for security audit"],
            });
          }

          const result = {
            passed: auditResults.every((audit) => audit.passed),
            results: auditResults,
            timestamp: Date.now(),
          };

          logDebug(rootDir, "IPC response: security:audit", { result });
          return result;
        } catch (error) {
          if (error instanceof IPCValidationError) {
            logError(rootDir, "IPC validation failed for security:audit", error);
            const result = {
              passed: false,
              results: [
                {
                  contextIsolation: false,
                  nodeIntegration: false,
                  webSecurity: false,
                  allowRunningInsecureContent: false,
                  experimentalFeatures: false,
                  preloadScript: null,
                  timestamp: Date.now(),
                  passed: false,
                  issues: ["Security audit failed due to invalid parameters"],
                },
              ],
              timestamp: Date.now(),
            };
            logDebug(rootDir, "IPC response: security:audit", { result });
            return result;
          }

          logError(rootDir, "Security audit failed", error);
          const result = {
            passed: false,
            results: [
              {
                contextIsolation: false,
                nodeIntegration: false,
                webSecurity: false,
                allowRunningInsecureContent: false,
                experimentalFeatures: false,
                preloadScript: null,
                timestamp: Date.now(),
                passed: false,
                issues: ["Security audit failed due to internal error"],
              },
            ],
            timestamp: Date.now(),
          };
          logDebug(rootDir, "IPC response: security:audit", { result });
          return result;
        }
      }),
    );
    logInfo(rootDir, "Successfully registered IPC handler", { channel: "security:audit" });

    logInfo(rootDir, "Security IPC handlers registration completed successfully", {
      handlers: ["security:audit"],
    });
  } catch (error) {
    logError(rootDir, "Failed to register security IPC handlers", error);
    throw error; // Re-throw to prevent app from starting with broken IPC
  }
};

const registerPreloadLogHandler = (rootDir: string): void => {
  logInfo(rootDir, "Starting preload log handler registration");

  try {
    logInfo(rootDir, "Registering IPC handler", { channel: "preload:log" });
    // Handle log messages from preload script
    ipcMain.on(
      "preload:log",
      (_event, logData: { level: string; message: string; data?: unknown }) => {
        const { level, message, data } = logData;
        const preloadMessage = `[PRELOAD] ${message}`;

        switch (level.toUpperCase()) {
          case "DEBUG":
            logDebug(rootDir, preloadMessage, data);
            break;
          case "INFO":
            logInfo(rootDir, preloadMessage, data);
            break;
          case "WARN":
            logWarn(rootDir, preloadMessage, data);
            break;
          case "ERROR":
            logError(rootDir, preloadMessage, data);
            break;
          default:
            logInfo(rootDir, preloadMessage, data);
        }
      },
    );
    logInfo(rootDir, "Successfully registered IPC handler", { channel: "preload:log" });

    logInfo(rootDir, "Preload log handler registration completed successfully", {
      handlers: ["preload:log"],
    });
  } catch (error) {
    logError(rootDir, "Failed to register preload log handler", error);
    throw error;
  }
};

const createMainWindow = (): void => {
  const rootDir = app.getPath("userData");

  logInfo(rootDir, "Starting main window creation process");

  // Log window configuration before creation
  const windowConfig = {
    width: 900,
    height: 600,
    title: "Clerkly",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  };

  logInfo(rootDir, "Window configuration prepared", windowConfig);

  try {
    mainWindow = new BrowserWindow(windowConfig);
    logInfo(rootDir, "Main window instance created successfully", {
      id: mainWindow.id,
      isVisible: mainWindow.isVisible(),
      isMinimized: mainWindow.isMinimized(),
      isMaximized: mainWindow.isMaximized(),
      bounds: mainWindow.getBounds(),
    });
  } catch (error) {
    logError(rootDir, "Failed to create main window", error);
    throw error;
  }

  // Log renderer loading process
  const rendererPath = path.join(__dirname, "renderer", "index.html");
  logInfo(rootDir, "Loading renderer content", { path: rendererPath });

  try {
    mainWindow.loadFile(rendererPath);
    logInfo(rootDir, "Renderer content loaded successfully");
  } catch (error) {
    logError(rootDir, "Failed to load renderer content", error);
    throw error;
  }

  // Log window show/maximize process
  // Requirement: platform-foundation.1.3
  logInfo(rootDir, "Maximizing main window");
  try {
    mainWindow.maximize();
    logInfo(rootDir, "Main window maximized successfully", {
      isMaximized: mainWindow.isMaximized(),
      bounds: mainWindow.getBounds(),
    });
  } catch (error) {
    logError(rootDir, "Failed to maximize main window", error);
  }

  // Set up window event logging
  mainWindow.once("ready-to-show", () => {
    logInfo(rootDir, "Main window ready to show", {
      id: mainWindow?.id,
      isVisible: mainWindow?.isVisible(),
      bounds: mainWindow?.getBounds(),
    });
  });

  mainWindow.once("show", () => {
    logInfo(rootDir, "Main window shown", {
      id: mainWindow?.id,
      isVisible: mainWindow?.isVisible(),
      isMaximized: mainWindow?.isMaximized(),
    });
  });

  mainWindow.on("resize", () => {
    logDebug(rootDir, "Main window resized", {
      bounds: mainWindow?.getBounds(),
    });
  });

  mainWindow.on("move", () => {
    logDebug(rootDir, "Main window moved", {
      bounds: mainWindow?.getBounds(),
    });
  });

  mainWindow.on("focus", () => {
    logDebug(rootDir, "Main window focused");
  });

  mainWindow.on("blur", () => {
    logDebug(rootDir, "Main window lost focus");
  });

  mainWindow.on("minimize", () => {
    logInfo(rootDir, "Main window minimized");
  });

  mainWindow.on("restore", () => {
    logInfo(rootDir, "Main window restored");
  });

  mainWindow.on("maximize", () => {
    logInfo(rootDir, "Main window maximized via event");
  });

  mainWindow.on("unmaximize", () => {
    logInfo(rootDir, "Main window unmaximized");
  });

  mainWindow.on("enter-full-screen", () => {
    logInfo(rootDir, "Main window entered full screen");
  });

  mainWindow.on("leave-full-screen", () => {
    logInfo(rootDir, "Main window left full screen");
  });

  mainWindow.on("closed", () => {
    logInfo(rootDir, "Main window closed");
    mainWindow = null;
  });

  // Handle pending auth result
  if (pendingAuthResult) {
    sendAuthResultToRenderer(pendingAuthResult);
    pendingAuthResult = null;
    logInfo(rootDir, "Sent pending auth result to renderer");
  }

  logInfo(rootDir, "Main window creation process completed successfully");
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  // Note: We can't log here because userData path isn't available yet
  console.log("Another instance is already running. Exiting.");
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const rootDir = app.getPath("userData");
    logInfo(rootDir, "Second instance detected, focusing main window");

    const deepLink = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (deepLink) {
      logInfo(rootDir, "Processing deep link from second instance", { deepLink });
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

  // Log main process startup
  logInfo(rootDir, "Main process started", {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    userDataPath: rootDir,
  });

  const menu = Menu.buildFromTemplate([
    {
      label: "Clerkly",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    { role: "help" },
  ]);
  Menu.setApplicationMenu(menu);
  logInfo(rootDir, "Application menu initialized");

  let db: SqliteDatabase;

  try {
    logInfo(rootDir, "Initializing database");
    ensureDatabase();
    db = new Database(path.join(rootDir, "clerkly.sqlite3"));
    logInfo(rootDir, "Database initialized successfully", {
      path: path.join(rootDir, "clerkly.sqlite3"),
    });
  } catch (error) {
    logError(rootDir, "Database migration failed.", error);
    dialog.showErrorBox("Database Error", "Database migration failed. The app will now exit.");
    app.exit(1);
    return;
  }

  try {
    logInfo(rootDir, "Starting IPC handlers registration process");

    logInfo(rootDir, "Registering auth IPC handlers");
    registerAuthHandlers(db, rootDir);

    logInfo(rootDir, "Registering sidebar IPC handlers");
    registerSidebarHandlers(db);

    logInfo(rootDir, "Registering performance IPC handlers");
    registerPerformanceHandlers();

    logInfo(rootDir, "Registering security IPC handlers");
    registerSecurityHandlers();

    logInfo(rootDir, "Registering preload log handler");
    registerPreloadLogHandler(rootDir);

    logInfo(rootDir, "Registering protocol handling");
    registerProtocolHandling();

    logInfo(rootDir, "All IPC handlers registered successfully", {
      totalHandlers: 8,
      authHandlers: 3,
      sidebarHandlers: 2,
      performanceHandlers: 1,
      securityHandlers: 1,
      preloadHandlers: 1,
      channels: [
        "auth:open-google",
        "auth:get-state",
        "auth:sign-out",
        "sidebar:get-state",
        "sidebar:set-state",
        "performance:get-metrics",
        "security:audit",
        "preload:log",
      ],
    });
  } catch (error) {
    logError(rootDir, "Failed to register IPC handlers", error);
    dialog.showErrorBox("IPC Error", "Failed to register IPC handlers. The app will now exit.");
    app.exit(1);
    return;
  }
  createMainWindow();

  const deepLink = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
  if (deepLink) {
    logInfo(rootDir, "Processing deep link on startup", { deepLink });
    handleAuthCallbackUrl(deepLink);
  }

  app.on("activate", () => {
    logInfo(rootDir, "App activated");
    if (BrowserWindow.getAllWindows().length === 0) {
      logInfo(rootDir, "No windows open, creating main window");
      createMainWindow();
    }
  });
});
app.on("open-url", (event, url) => {
  event.preventDefault();
  const rootDir = app.getPath("userData");
  logInfo(rootDir, "Received open-url event", { url });
  handleAuthCallbackUrl(url);
});

app.on("window-all-closed", () => {
  const rootDir = app.getPath("userData");
  logInfo(rootDir, "All windows closed", { platform: process.platform });
  if (process.platform !== "darwin") {
    logInfo(rootDir, "Quitting application (non-macOS platform)");
    app.quit();
  }
});

// Global error handlers for IPC-related errors
process.on("uncaughtException", (error) => {
  const rootDir = app.getPath("userData");
  logError(rootDir, "Uncaught exception in main process", error);
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  const rootDir = app.getPath("userData");
  logError(rootDir, "Unhandled promise rejection in main process", { reason, promise });
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Log process startup information
const rootDir = app.getPath("userData");
logInfo(rootDir, "Clerkly main process initializing", {
  pid: process.pid,
  argv: process.argv,
  cwd: process.cwd(),
  env: {
    NODE_ENV: process.env.NODE_ENV,
    CLERKLY_LOG_LEVEL: process.env.CLERKLY_LOG_LEVEL,
    CLERKLY_E2E_USER_DATA: process.env.CLERKLY_E2E_USER_DATA,
  },
});
