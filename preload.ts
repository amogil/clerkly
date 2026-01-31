// Requirements: platform-foundation.2.2, google-oauth-auth.5.1, platform-foundation.3.3, platform-foundation.3.4
import { contextBridge, ipcRenderer } from "electron";
import type { AuthResult, AuthState, SidebarState, OperationResult } from "./src/ipc/types";

// Preload logging utility - sends log messages to main process for centralized logging
const logToMain = (level: string, message: string, data?: unknown): void => {
  try {
    // Send log message to main process via IPC
    ipcRenderer.send("preload:log", { level, message, data });
  } catch (error) {
    // Fallback to console if IPC fails
    console.error("Preload logging failed:", error);
    console.log(`[PRELOAD ${level}] ${message}`, data);
  }
};

// Logging functions for preload context
const preloadLog = {
  debug: (message: string, data?: unknown) => logToMain("DEBUG", message, data),
  info: (message: string, data?: unknown) => logToMain("INFO", message, data),
  warn: (message: string, data?: unknown) => logToMain("WARN", message, data),
  error: (message: string, data?: unknown) => logToMain("ERROR", message, data),
};

// Helper function to create IPC call wrapper with logging
const createLoggedIPCCall = <T extends unknown[], R>(
  channel: string,
  ipcCall: (...args: T) => Promise<R>,
) => {
  return async (...args: T): Promise<R> => {
    const startTime = performance.now();
    preloadLog.debug(`IPC call initiated: ${channel}`, { args });

    try {
      const result = await ipcCall(...args);
      const duration = performance.now() - startTime;
      preloadLog.debug(`IPC call completed: ${channel}`, {
        duration: `${duration.toFixed(2)}ms`,
        success: true,
        result,
      });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      preloadLog.error(`IPC call failed: ${channel}`, {
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
        args,
      });
      throw error;
    }
  };
};

const api = {
  openGoogleAuth: createLoggedIPCCall(
    "auth:open-google",
    (): Promise<AuthResult> => ipcRenderer.invoke("auth:open-google") as Promise<AuthResult>,
  ),
  getAuthState: createLoggedIPCCall(
    "auth:get-state",
    (): Promise<AuthState> => ipcRenderer.invoke("auth:get-state") as Promise<AuthState>,
  ),
  signOut: createLoggedIPCCall(
    "auth:sign-out",
    (): Promise<OperationResult> => ipcRenderer.invoke("auth:sign-out") as Promise<OperationResult>,
  ),
  getSidebarState: createLoggedIPCCall(
    "sidebar:get-state",
    (): Promise<SidebarState> => ipcRenderer.invoke("sidebar:get-state") as Promise<SidebarState>,
  ),
  setSidebarState: createLoggedIPCCall(
    "sidebar:set-state",
    (collapsed: boolean): Promise<OperationResult> =>
      ipcRenderer.invoke("sidebar:set-state", { collapsed }) as Promise<OperationResult>,
  ),
  onAuthResult: (callback: (result: AuthResult) => void): (() => void) => {
    preloadLog.debug("Setting up auth result listener");

    const handler = (_: Electron.IpcRendererEvent, result: AuthResult) => {
      preloadLog.debug("Received auth result from main process", { result });
      callback(result);
    };

    ipcRenderer.on("auth:result", handler);
    return () => {
      preloadLog.debug("Removing auth result listener");
      ipcRenderer.removeListener("auth:result", handler);
    };
  },
};

contextBridge.exposeInMainWorld("clerkly", api);

// Log preload script initialization
preloadLog.info("Preload script initialized", {
  contextIsolation: true,
  nodeIntegration: false,
  apiMethods: Object.keys(api),
});
