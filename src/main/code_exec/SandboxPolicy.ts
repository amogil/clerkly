// Requirements: code_exec.2.3.1-2.3.2

import type { Session, WebContents, Event } from 'electron';

export const SANDBOX_DOCUMENT_CSP =
  "default-src 'none'; script-src 'self'; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; object-src 'none';";

// Requirements: code_exec.2.3.1
export function isBlockedEgressUrl(url: string): boolean {
  return /^(https?:|wss?:)/i.test(url);
}

// Requirements: code_exec.2.3.1
export function attachSandboxSessionPolicies(session: Session): void {
  session.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      callback({ cancel: isBlockedEgressUrl(details.url) });
    }
  );

  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
}

// Requirements: code_exec.2.3.1-2.3.2
export function attachSandboxNavigationGuards(webContents: WebContents): void {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  webContents.on('will-navigate', (event: Event) => {
    event.preventDefault();
  });

  webContents.on('will-redirect', (event: Event) => {
    event.preventDefault();
  });
}
