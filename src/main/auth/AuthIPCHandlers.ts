// Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, google-oauth-auth.8.4, google-oauth-auth.8.5

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { OAuthClientManager } from './OAuthClientManager';

/**
 * IPC result interface
 * Requirements: google-oauth-auth.8.5
 */
interface IPCResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Auth IPC Handlers
 * Manages IPC communication between renderer and main processes for OAuth authentication
 * Requirements: google-oauth-auth.8
 */
export class AuthIPCHandlers {
  private oauthClient: OAuthClientManager;
  private handlersRegistered: boolean = false;

  constructor(oauthClient: OAuthClientManager) {
    this.oauthClient = oauthClient;
  }

  /**
   * Register all auth IPC handlers
   * Requirements: google-oauth-auth.8.1
   */
  registerHandlers(): void {
    if (this.handlersRegistered) {
      console.warn('[AuthIPCHandlers] Handlers already registered');
      return;
    }

    ipcMain.handle('auth:start-login', this.handleStartLogin.bind(this));
    ipcMain.handle('auth:get-status', this.handleGetStatus.bind(this));
    ipcMain.handle('auth:logout', this.handleLogout.bind(this));

    this.handlersRegistered = true;
    console.log('[AuthIPCHandlers] Handlers registered');
  }

  /**
   * Unregister all auth IPC handlers
   * Requirements: google-oauth-auth.8.1
   */
  unregisterHandlers(): void {
    if (!this.handlersRegistered) {
      return;
    }

    ipcMain.removeHandler('auth:start-login');
    ipcMain.removeHandler('auth:get-status');
    ipcMain.removeHandler('auth:logout');

    this.handlersRegistered = false;
    console.log('[AuthIPCHandlers] Handlers unregistered');
  }

  /**
   * Handle start login request
   * Requirements: google-oauth-auth.8.1, google-oauth-auth.8.5
   * @param event IPC event
   * @returns IPC result with success status
   */
  private async handleStartLogin(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      console.log('[AuthIPCHandlers] Starting login flow');
      await this.oauthClient.startAuthFlow();

      return {
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AuthIPCHandlers] Start login error:', errorMessage);
      return {
        success: false,
        error: errorMessage || 'Failed to start login',
      };
    }
  }

  /**
   * Handle get auth status request
   * Requirements: google-oauth-auth.8.2, google-oauth-auth.8.5
   * @param event IPC event
   * @returns IPC result with authorization status
   */
  private async handleGetStatus(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      console.log('[AuthIPCHandlers] Getting auth status');
      const authStatus = await this.oauthClient.getAuthStatus();

      return {
        success: true,
        authorized: authStatus.authorized,
        error: authStatus.error,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AuthIPCHandlers] Get status error:', errorMessage);
      return {
        success: false,
        authorized: false,
        error: errorMessage || 'Failed to get auth status',
      };
    }
  }

  /**
   * Handle logout request
   * Requirements: google-oauth-auth.8.3, google-oauth-auth.8.5
   * @param event IPC event
   * @returns IPC result with success status
   */
  private async handleLogout(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      console.log('[AuthIPCHandlers] Logging out');
      await this.oauthClient.logout();

      // Send event to all renderer processes
      this.sendAuthEvent('auth:logout-complete', { success: true });

      return {
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AuthIPCHandlers] Logout error:', errorMessage);
      return {
        success: false,
        error: errorMessage || 'Failed to logout',
      };
    }
  }

  /**
   * Send auth event to all renderer processes
   * Requirements: google-oauth-auth.8.4
   * @param channel Event channel
   * @param data Event data
   */
  private sendAuthEvent(channel: string, data: Record<string, unknown>): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => {
      window.webContents.send(channel, data);
    });
  }

  /**
   * Send auth success event to all renderer processes
   * Requirements: google-oauth-auth.8.4
   */
  sendAuthSuccess(): void {
    this.sendAuthEvent('auth:success', { authorized: true });
  }

  /**
   * Send auth error event to all renderer processes
   * Requirements: google-oauth-auth.8.4
   * @param error Error message
   * @param errorCode Error code
   */
  sendAuthError(error: string, errorCode?: string): void {
    this.sendAuthEvent('auth:error', { error, errorCode });
  }
}
