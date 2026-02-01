// Requirements: platform-foundation.2.2, google-oauth-auth.5.1, platform-foundation.3.3, platform-foundation.3.4
import { contextBridge, ipcRenderer } from "electron";
import type {
  AuthResult,
  AuthState,
  SidebarState,
  OperationResult,
  PerformanceMetrics,
  SecurityAuditResult,
} from "./src/ipc/types";

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
  /**
   * Get the current sidebar collapsed state
   * Requirements: sidebar-navigation.5.1, sidebar-navigation.5.3
   *
   * @returns Promise resolving to SidebarState with collapsed boolean
   * @example
   * const state = await window.clerkly.getSidebarState();
   * console.log(state.collapsed); // true or false
   */
  getSidebarState: createLoggedIPCCall(
    "sidebar:get-state",
    (): Promise<SidebarState> => ipcRenderer.invoke("sidebar:get-state") as Promise<SidebarState>,
  ),

  /**
   * Set the sidebar collapsed state
   * Requirements: sidebar-navigation.5.1, sidebar-navigation.5.3
   *
   * @param collapsed - Boolean indicating whether sidebar should be collapsed
   * @returns Promise resolving to OperationResult with success boolean
   * @example
   * const result = await window.clerkly.setSidebarState(true);
   * if (result.success) {
   *   console.log('Sidebar state saved successfully');
   * }
   */
  setSidebarState: createLoggedIPCCall(
    "sidebar:set-state",
    (collapsed: boolean): Promise<OperationResult> =>
      ipcRenderer.invoke("sidebar:set-state", { collapsed }) as Promise<OperationResult>,
  ),
  getPerformanceMetrics: createLoggedIPCCall(
    "performance:get-metrics",
    (): Promise<PerformanceMetrics> =>
      ipcRenderer.invoke("performance:get-metrics") as Promise<PerformanceMetrics>,
  ),
  performSecurityAudit: createLoggedIPCCall(
    "security:audit",
    (): Promise<SecurityAuditResult> =>
      ipcRenderer.invoke("security:audit") as Promise<SecurityAuditResult>,
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
