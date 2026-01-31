// Requirements: platform-foundation.2.2, google-oauth-auth.5.1, platform-foundation.3.3, platform-foundation.3.4
import { contextBridge, ipcRenderer } from "electron";

type AuthResult = {
  success: boolean;
  error?: string;
};

const api = {
  openGoogleAuth: (): Promise<AuthResult> =>
    ipcRenderer.invoke("auth:open-google") as Promise<AuthResult>,
  getAuthState: (): Promise<{ authorized: boolean }> =>
    ipcRenderer.invoke("auth:get-state") as Promise<{ authorized: boolean }>,
  signOut: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("auth:sign-out") as Promise<{ success: boolean }>,
  getSidebarState: (): Promise<{ collapsed: boolean }> =>
    ipcRenderer.invoke("sidebar:get-state") as Promise<{ collapsed: boolean }>,
  setSidebarState: (collapsed: boolean): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("sidebar:set-state", { collapsed }) as Promise<{ success: boolean }>,
  onAuthResult: (callback: (result: AuthResult) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, result: AuthResult) => {
      callback(result);
    };

    ipcRenderer.on("auth:result", handler);
    return () => {
      ipcRenderer.removeListener("auth:result", handler);
    };
  },
};

contextBridge.exposeInMainWorld("clerkly", api);
