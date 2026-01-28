// Requirements: E.G.11, E.G.16, E.G.19
import { contextBridge, ipcRenderer } from "electron";

type AuthResult = {
  success: boolean;
  error?: string;
};

const api = {
  openGoogleAuth: (): Promise<AuthResult> =>
    ipcRenderer.invoke("auth:open-google") as Promise<AuthResult>,
};

contextBridge.exposeInMainWorld("clerkly", api);
