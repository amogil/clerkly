// Requirements: code_exec.2.2, code_exec.2.8.2, sandbox-http-request.1.2

import { contextBridge, ipcRenderer } from 'electron';

const SESSION_ID_PREFIX = '--code-exec-session-id=';
const sessionArg = process.argv.find((arg) => arg.startsWith(SESSION_ID_PREFIX));
const sessionId = sessionArg ? sessionArg.slice(SESSION_ID_PREFIX.length) : '';

contextBridge.exposeInMainWorld('__sandboxBridge', {
  invokeTool: async (toolName: string, input: unknown) =>
    ipcRenderer.invoke('code-exec:sandbox-tool', {
      sessionId,
      toolName,
      input,
    }),
});
