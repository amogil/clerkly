// Requirements: E.T.4, E.A.3, E.A.11, E.A.14, E.I.1
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
