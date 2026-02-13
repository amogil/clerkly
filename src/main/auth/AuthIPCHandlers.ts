// Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, google-oauth-auth.8.4, google-oauth-auth.8.5, account-profile.1.2, account-profile.1.7

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { OAuthClientManager } from './OAuthClientManager';
import { UserManager, User } from './UserManager';
import { Logger } from '../Logger';
import { MainEventBus } from '../events/MainEventBus';
import {
  AuthSucceededEvent,
  AuthFailedEvent,
  ProfileSyncedEvent,
  ErrorCreatedEvent,
  UserLogoutEvent,
} from '../../shared/events/types';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * IPC result interface
 * Requirements: google-oauth-auth.8.5, account-profile.1.2, account-profile.1.7
 */
interface IPCResult {
  success: boolean;
  error?: string;
  user?: User | null;
  [key: string]: unknown;
}

/**
 * Auth IPC Handlers
 * Manages IPC communication between renderer and main processes for OAuth authentication
 * Uses EventBus for auth events (auth.succeeded, auth.failed, profile.synced)
 * Requirements: google-oauth-auth.8, account-profile.1.2, account-profile.1.7
 */
export class AuthIPCHandlers {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('AuthIPCHandlers');
  private oauthClient: OAuthClientManager;
  private userManager: UserManager | null = null;
  private handlersRegistered: boolean = false;

  constructor(oauthClient: OAuthClientManager) {
    this.oauthClient = oauthClient;
  }

  /**
   * Set profile manager for profile-related IPC handlers
   * Requirements: account-profile.1.2
   * @param userManager UserManager instance
   */
  setUserManager(userManager: UserManager): void {
    this.userManager = userManager;
    this.logger.info('User manager set');
  }

  /**
   * Register all auth IPC handlers
   * Requirements: google-oauth-auth.8.1, account-profile.1.2, account-profile.1.5
   */
  registerHandlers(): void {
    if (this.handlersRegistered) {
      this.logger.warn('Handlers already registered');
      return;
    }

    ipcMain.handle('auth:start-login', this.handleStartLogin.bind(this));
    ipcMain.handle('auth:get-status', this.handleGetStatus.bind(this));
    ipcMain.handle('auth:logout', this.handleLogout.bind(this));
    ipcMain.handle('auth:get-user', this.handleGetUser.bind(this));
    ipcMain.handle('auth:refresh-user', this.handleRefreshProfile.bind(this));

    this.handlersRegistered = true;
    this.logger.info('Handlers registered');
  }

  /**
   * Unregister all auth IPC handlers
   * Requirements: google-oauth-auth.8.1, account-profile.1.2, account-profile.1.5
   */
  unregisterHandlers(): void {
    if (!this.handlersRegistered) {
      return;
    }

    ipcMain.removeHandler('auth:start-login');
    ipcMain.removeHandler('auth:get-status');
    ipcMain.removeHandler('auth:logout');
    ipcMain.removeHandler('auth:get-user');
    ipcMain.removeHandler('auth:refresh-user');

    this.handlersRegistered = false;
    this.logger.info('Handlers unregistered');
  }

  /**
   * Handle start login request
   * Requirements: google-oauth-auth.8.1, google-oauth-auth.8.5
   * @param event IPC event
   * @returns IPC result with success status
   */
  private async handleStartLogin(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      this.logger.info('Starting login flow');
      await this.oauthClient.startAuthFlow();

      return {
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Start login error: ${errorMessage}`);
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
      this.logger.info('Getting auth status');
      const authStatus = await this.oauthClient.getAuthStatus();

      return {
        success: true,
        authorized: authStatus.authorized,
        error: authStatus.error,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Get status error: ${errorMessage}`);
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
      this.logger.info('Logging out');
      await this.oauthClient.logout();

      // Publish user.logout event via EventBus
      const eventBus = MainEventBus.getInstance();
      eventBus.publish(new UserLogoutEvent());

      return {
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Logout error: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage || 'Failed to logout',
      };
    }
  }

  /**
   * Handle get user request
   * Returns current user from database
   * Requirements: account-profile.1.2, account-profile.1.7
   * @param event IPC event
   * @returns IPC result with user data or null
   */
  private async handleGetUser(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      // Requirements: account-profile.1.2, account-profile.1.7
      if (!this.userManager) {
        this.logger.warn('User manager not set');
        return {
          success: true,
          user: null,
        };
      }

      this.logger.info('Getting user');
      const user = this.userManager.getCurrentUser();

      return {
        success: true,
        user: user,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get user: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage || 'Failed to get user',
        user: null,
      };
    }
  }

  /**
   * Handle refresh profile request
   * Fetches fresh profile data from Google API and publishes profile.synced event
   * Requirements: account-profile.1.5
   * @param event IPC event
   * @returns IPC result with fresh user data or null
   */
  private async handleRefreshProfile(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      // Requirements: account-profile.1.5
      if (!this.userManager) {
        this.logger.warn('User manager not set');
        return {
          success: false,
          error: 'User manager not initialized',
          user: null,
        };
      }

      this.logger.info('Refreshing profile');
      const user = await this.userManager.fetchProfile();
      Logger.info(
        'AuthIPCHandlers',
        `Profile refresh completed, result: ${user ? 'success' : 'null'}`
      );

      // Publish profile.synced event via EventBus
      // Requirements: account-profile.1.5 - Notify UI about profile updates
      if (user) {
        this.publishProfileSynced(user);
      }

      return {
        success: true,
        user: user,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('AuthIPCHandlers', `Failed to refresh user: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage || 'Failed to refresh profile',
        profile: null,
      };
    }
  }

  /**
   * Publish auth.succeeded event via EventBus
   * Called after successful OAuth flow and profile fetch
   * Requirements: google-oauth-auth.8.4
   * @param userId User ID from profile (required)
   */
  sendAuthSuccess(userId: string): void {
    const eventBus = MainEventBus.getInstance();
    eventBus.publish(new AuthSucceededEvent(userId));
  }

  /**
   * Publish auth.failed event via EventBus
   * Called when OAuth flow fails
   * Requirements: google-oauth-auth.8.4
   * @param error Error message
   * @param errorCode Error code
   */
  sendAuthError(error: string, errorCode?: string): void {
    const eventBus = MainEventBus.getInstance();
    eventBus.publish(new AuthFailedEvent(error, errorCode));
  }

  /**
   * Publish profile.synced event via EventBus
   * Called when user is fetched and saved
   * @param user User data from database
   */
  publishProfileSynced(user: User): void {
    const eventBus = MainEventBus.getInstance();
    eventBus.publish(new ProfileSyncedEvent(user));
  }

  /**
   * Send error notification via EventBus
   * Requirements: error-notifications.1.1, error-notifications.1.4
   * @param message Error message
   * @param context Context of the operation that failed
   */
  sendErrorNotification(message: string, context: string): void {
    // Requirements: error-notifications.1.4 - Log to console
    this.logger.error(`[${context}] Error: ${message}`);

    // Requirements: error-notifications.1.1 - Publish error.created event
    const eventBus = MainEventBus.getInstance();
    eventBus.publish(new ErrorCreatedEvent(message, context));
  }
}
