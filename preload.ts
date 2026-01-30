// Requirements: E.G.11, E.G.16, E.G.19
import { contextBridge, ipcRenderer } from "electron";

type AuthResult = {
  success: boolean;
  error?: string;
};

const api = {
  openGoogleAuth: (): Promise<AuthResult> =>
    ipcRenderer.invoke("auth:open-google") as Promise<AuthResult>,
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
