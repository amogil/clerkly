// Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, google-oauth-auth.8.4, google-oauth-auth.8.5, account-profile.1.2, account-profile.1.7

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { OAuthClientManager } from './OAuthClientManager';
import { UserProfileManager, UserProfile } from './UserProfileManager';
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
  profile?: UserProfile | null;
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
  private profileManager: UserProfileManager | null = null;
  private handlersRegistered: boolean = false;

  constructor(oauthClient: OAuthClientManager) {
    this.oauthClient = oauthClient;
  }

  /**
   * Set profile manager for profile-related IPC handlers
   * Requirements: account-profile.1.2
   * @param profileManager UserProfileManager instance
   */
  setProfileManager(profileManager: UserProfileManager): void {
    this.profileManager = profileManager;
    this.logger.info('Profile manager set');
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
    ipcMain.handle('auth:get-profile', this.handleGetProfile.bind(this));
    ipcMain.handle('auth:refresh-profile', this.handleRefreshProfile.bind(this));

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
    ipcMain.removeHandler('auth:get-profile');
    ipcMain.removeHandler('auth:refresh-profile');

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
   * Handle get profile request
   * Returns cached profile from local storage
   * Requirements: account-profile.1.2, account-profile.1.7
   * @param event IPC event
   * @returns IPC result with profile data or null
   */
  private async handleGetProfile(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      // Requirements: account-profile.1.2, account-profile.1.7
      if (!this.profileManager) {
        this.logger.warn('Profile manager not set');
        return {
          success: true,
          profile: null,
        };
      }

      this.logger.info('Getting profile');
      const profile = await this.profileManager.loadProfile();

      return {
        success: true,
        profile: profile,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get profile: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage || 'Failed to get profile',
        profile: null,
      };
    }
  }

  /**
   * Handle refresh profile request
   * Fetches fresh profile data from Google API and publishes profile.synced event
   * Requirements: account-profile.1.5
   * @param event IPC event
   * @returns IPC result with fresh profile data or null
   */
  private async handleRefreshProfile(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      // Requirements: account-profile.1.5
      if (!this.profileManager) {
        this.logger.warn('Profile manager not set');
        return {
          success: false,
          error: 'Profile manager not initialized',
          profile: null,
        };
      }

      this.logger.info('Refreshing profile');
      const profile = await this.profileManager.fetchProfile();
      Logger.info(
        'AuthIPCHandlers',
        `Profile refresh completed, result: ${profile ? 'success' : 'null'}`
      );

      // Publish profile.synced event via EventBus
      // Requirements: account-profile.1.5 - Notify UI about profile updates
      if (profile) {
        this.publishProfileSynced(profile);
      }

      return {
        success: true,
        profile: profile,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(
        'AuthIPCHandlers',
        `[AuthIPCHandlers] Failed to refresh profile: ${errorMessage}`
      );
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
   * Called when profile is fetched and saved
   * @param profile User profile data
   */
  publishProfileSynced(profile: UserProfile): void {
    const eventBus = MainEventBus.getInstance();
    eventBus.publish(new ProfileSyncedEvent(profile));
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
