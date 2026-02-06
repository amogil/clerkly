// Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, google-oauth-auth.8.4, google-oauth-auth.8.5, ui.6.2, ui.6.7

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { OAuthClientManager } from './OAuthClientManager';
import { UserProfileManager, UserProfile } from './UserProfileManager';

/**
 * IPC result interface
 * Requirements: google-oauth-auth.8.5, ui.6.2, ui.6.7
 */
interface IPCResult {
  success: boolean;
  error?: string;
  profile?: UserProfile | null;
  [key: string]: unknown;
}

/**
 * Auth IPC Handlers
 * Manages IPC communication between renderer and main processes for OAuth authentication
 * Requirements: google-oauth-auth.8, ui.6.2, ui.6.7
 */
export class AuthIPCHandlers {
  private oauthClient: OAuthClientManager;
  private profileManager: UserProfileManager | null = null;
  private handlersRegistered: boolean = false;

  constructor(oauthClient: OAuthClientManager) {
    this.oauthClient = oauthClient;
  }

  /**
   * Set profile manager for profile-related IPC handlers
   * Requirements: ui.6.2
   * @param profileManager UserProfileManager instance
   */
  setProfileManager(profileManager: UserProfileManager): void {
    this.profileManager = profileManager;
    console.log('[AuthIPCHandlers] Profile manager set');
  }

  /**
   * Register all auth IPC handlers
   * Requirements: google-oauth-auth.8.1, ui.6.2, ui.6.5
   */
  registerHandlers(): void {
    if (this.handlersRegistered) {
      console.warn('[AuthIPCHandlers] Handlers already registered');
      return;
    }

    ipcMain.handle('auth:start-login', this.handleStartLogin.bind(this));
    ipcMain.handle('auth:get-status', this.handleGetStatus.bind(this));
    ipcMain.handle('auth:logout', this.handleLogout.bind(this));
    ipcMain.handle('auth:get-profile', this.handleGetProfile.bind(this));
    ipcMain.handle('auth:refresh-profile', this.handleRefreshProfile.bind(this));

    this.handlersRegistered = true;
    console.log('[AuthIPCHandlers] Handlers registered');
  }

  /**
   * Unregister all auth IPC handlers
   * Requirements: google-oauth-auth.8.1, ui.6.2, ui.6.5
   */
  unregisterHandlers(): void {
    if (!this.handlersRegistered) {
      return;
    }

    ipcMain.removeHandler('auth:start-login');
    ipcMain.removeHandler('auth:get-status');
    ipcMain.removeHandler('auth:logout');
    ipcMain.removeHandler('auth:get-profile');
    ipcMain.removeHandler('auth:refresh-profile');

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
   * Handle get profile request
   * Returns cached profile from local storage
   * Requirements: ui.6.2, ui.6.7
   * @param event IPC event
   * @returns IPC result with profile data or null
   */
  private async handleGetProfile(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      // Requirements: ui.6.2, ui.6.7
      if (!this.profileManager) {
        console.warn('[AuthIPCHandlers] Profile manager not set');
        return {
          success: true,
          profile: null,
        };
      }

      console.log('[AuthIPCHandlers] Getting profile');
      const profile = await this.profileManager.loadProfile();

      return {
        success: true,
        profile: profile,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AuthIPCHandlers] Failed to get profile:', errorMessage);
      return {
        success: false,
        error: errorMessage || 'Failed to get profile',
        profile: null,
      };
    }
  }

  /**
   * Handle refresh profile request
   * Fetches fresh profile data from Google API
   * Requirements: ui.6.5
   * @param event IPC event
   * @returns IPC result with fresh profile data or null
   */
  private async handleRefreshProfile(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      // Requirements: ui.6.5
      if (!this.profileManager) {
        console.warn('[AuthIPCHandlers] Profile manager not set');
        return {
          success: false,
          error: 'Profile manager not initialized',
          profile: null,
        };
      }

      console.log('[AuthIPCHandlers] Refreshing profile');
      const profile = await this.profileManager.fetchProfile();

      // Broadcast profile update event to all windows
      // Requirements: ui.6.5 - Notify UI about profile updates
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window) => {
        window.webContents.send('auth:profile-updated', profile);
      });

      return {
        success: true,
        profile: profile,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AuthIPCHandlers] Failed to refresh profile:', errorMessage);
      return {
        success: false,
        error: errorMessage || 'Failed to refresh profile',
        profile: null,
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

  /**
   * Send error notification to all renderer processes
   * Requirements: ui.7.1, ui.7.4
   * @param message Error message
   * @param context Context of the operation that failed
   */
  sendErrorNotification(message: string, context: string): void {
    // Requirements: ui.7.4 - Log to console
    console.error(`[${context}] Error:`, message);

    // Requirements: ui.7.1 - Notify renderer
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => {
      window.webContents.send('error:notify', message, context);
    });
  }
}
