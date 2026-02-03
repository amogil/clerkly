// Requirements: google-oauth-auth.14.1, google-oauth-auth.14.2, google-oauth-auth.14.3, google-oauth-auth.14.4, google-oauth-auth.14.5, google-oauth-auth.14.6

import { BrowserWindow } from 'electron';
import WindowManager from '../WindowManager';
import { OAuthClientManager } from './OAuthClientManager';

/**
 * Auth Window Manager
 *
 * Manages window transitions during the OAuth authentication flow.
 * Handles showing login screen, main window, and error states.
 *
 * Requirements: google-oauth-auth.14.1, google-oauth-auth.14.2, google-oauth-auth.14.3,
 *               google-oauth-auth.14.4, google-oauth-auth.14.5, google-oauth-auth.14.6
 */
export class AuthWindowManager {
  private windowManager: WindowManager;
  private oauthClient: OAuthClientManager;
  private currentWindow: BrowserWindow | null = null;

  /**
   * Creates a new AuthWindowManager instance
   *
   * Requirements: google-oauth-auth.14.1
   *
   * @param windowManager - WindowManager instance for window operations
   * @param oauthClient - OAuthClientManager instance for auth status checks
   */
  constructor(windowManager: WindowManager, oauthClient: OAuthClientManager) {
    this.windowManager = windowManager;
    this.oauthClient = oauthClient;
  }

  /**
   * Initializes the application by checking auth status and showing appropriate window
   *
   * Requirements: google-oauth-auth.14.1, google-oauth-auth.14.2, google-oauth-auth.14.3
   *
   * @returns Promise that resolves when initialization is complete
   */
  async initializeApp(): Promise<void> {
    try {
      // Requirements: google-oauth-auth.14.1
      const authStatus = await this.oauthClient.getAuthStatus();

      if (authStatus.authorized) {
        // Requirements: google-oauth-auth.14.3
        await this.showMainWindow();
      } else {
        // Requirements: google-oauth-auth.14.2
        await this.showLoginWindow();
      }
    } catch (error) {
      console.error('[AuthWindowManager] Failed to initialize app:', error);
      // Show login window on error
      await this.showLoginWindow();
    }
  }

  /**
   * Shows the login window with authentication screen
   *
   * Requirements: google-oauth-auth.14.2
   *
   * @returns Promise that resolves when window is shown
   */
  private async showLoginWindow(): Promise<void> {
    try {
      // Create window if not exists
      if (!this.windowManager.isWindowCreated()) {
        this.currentWindow = this.windowManager.createWindow();
      } else {
        this.currentWindow = this.windowManager.getWindow();
      }

      if (!this.currentWindow) {
        throw new Error('Failed to create window');
      }

      // Configure window for login screen (smaller size)
      this.windowManager.configureWindow({
        width: 600,
        height: 800,
        resizable: false,
      });

      // Load login screen route
      // Note: The actual routing will be handled by the renderer process
      // This is just setting up the window
    } catch (error) {
      console.error('[AuthWindowManager] Failed to show login window:', error);
      throw error;
    }
  }

  /**
   * Shows the main application window
   *
   * Requirements: google-oauth-auth.14.3
   *
   * @returns Promise that resolves when window is shown
   */
  private async showMainWindow(): Promise<void> {
    try {
      // Close existing window if it's the login window
      if (this.windowManager.isWindowCreated()) {
        await this.windowManager.closeWindow();
        this.currentWindow = null;
      }

      // Create main window
      this.currentWindow = this.windowManager.createWindow();

      if (!this.currentWindow) {
        throw new Error('Failed to create main window');
      }

      // Main window uses default configuration (maximized, resizable)
    } catch (error) {
      console.error('[AuthWindowManager] Failed to show main window:', error);
      throw error;
    }
  }

  /**
   * Shows the login error screen with error details
   *
   * Requirements: google-oauth-auth.14.5
   *
   * @param error - Error message to display
   * @param errorCode - Optional error code for specific error handling
   * @returns Promise that resolves when error screen is shown
   */
  private async showLoginError(error: string, errorCode?: string): Promise<void> {
    try {
      // Update window content to show error
      // The actual error display will be handled by the renderer process
      // through IPC events
      console.log('[AuthWindowManager] Showing login error:', { error, errorCode });

      // Window should already exist from login screen
      if (!this.currentWindow) {
        await this.showLoginWindow();
      }
    } catch (err) {
      console.error('[AuthWindowManager] Failed to show login error:', err);
      throw err;
    }
  }

  /**
   * Handles successful authentication
   *
   * Requirements: google-oauth-auth.14.4
   *
   * @returns Promise that resolves when main window is shown
   */
  private async handleAuthSuccess(): Promise<void> {
    try {
      console.log('[AuthWindowManager] Authentication successful, showing main window');
      await this.showMainWindow();
    } catch (error) {
      console.error('[AuthWindowManager] Failed to handle auth success:', error);
      throw error;
    }
  }

  /**
   * Handles authentication error
   *
   * Requirements: google-oauth-auth.14.5, google-oauth-auth.14.6
   *
   * @param error - Error message
   * @param errorCode - Optional error code
   * @returns Promise that resolves when error screen is shown
   */
  private async handleAuthError(error: string, errorCode?: string): Promise<void> {
    try {
      console.log('[AuthWindowManager] Authentication failed:', { error, errorCode });
      // Requirements: google-oauth-auth.14.5
      await this.showLoginError(error, errorCode);
    } catch (err) {
      console.error('[AuthWindowManager] Failed to handle auth error:', err);
      throw err;
    }
  }

  /**
   * Public method to handle authentication success (called from IPC handlers)
   *
   * Requirements: google-oauth-auth.14.4
   *
   * @returns Promise that resolves when main window is shown
   */
  async onAuthSuccess(): Promise<void> {
    return this.handleAuthSuccess();
  }

  /**
   * Public method to handle authentication error (called from IPC handlers)
   *
   * Requirements: google-oauth-auth.14.5
   *
   * @param error - Error message
   * @param errorCode - Optional error code
   * @returns Promise that resolves when error screen is shown
   */
  async onAuthError(error: string, errorCode?: string): Promise<void> {
    return this.handleAuthError(error, errorCode);
  }

  /**
   * Public method to retry authentication (show login screen again)
   *
   * Requirements: google-oauth-auth.14.6
   *
   * @returns Promise that resolves when login window is shown
   */
  async onRetry(): Promise<void> {
    try {
      console.log('[AuthWindowManager] Retrying authentication');
      await this.showLoginWindow();
    } catch (error) {
      console.error('[AuthWindowManager] Failed to retry authentication:', error);
      throw error;
    }
  }

  /**
   * Gets the current window instance
   *
   * @returns Current BrowserWindow or null
   */
  getWindow(): BrowserWindow | null {
    return this.currentWindow;
  }
}
