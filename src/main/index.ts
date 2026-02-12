// Requirements: clerkly.1.1, clerkly.1.2, clerkly.1.3, clerkly.1.4, google-oauth-auth.2.1, google-oauth-auth.2.2, google-oauth-auth.2.5

/**
 * Main entry point for Clerkly Electron application
 * Initializes all components and manages application lifecycle
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import WindowManager from './WindowManager';
import { LifecycleManager } from './LifecycleManager';
import { DataManager } from './DataManager';
import { IPCHandlers } from './IPCHandlers';
import { OAuthClientManager } from './auth/OAuthClientManager';
import { TokenStorageManager } from './auth/TokenStorageManager';
import { UserProfileManager } from './auth/UserProfileManager';
import { getOAuthConfig, OAUTH_CONFIG } from './auth/OAuthConfig';
import { AuthIPCHandlers } from './auth/AuthIPCHandlers';
import { AIAgentSettingsManager } from './AIAgentSettingsManager';
import { SettingsIPCHandlers } from './SettingsIPCHandlers';
import { Logger } from './Logger';

// Requirements: clerkly.3.5, clerkly.3.7 - Create parameterized logger for Main module
const logger = Logger.create('Main');

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
// Set app name for single instance lock
// This helps macOS identify the app correctly
app.setName('Clerkly');

// Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
// Request single instance lock BEFORE registering protocol
// This ensures that deep links are handled by the existing instance
// Skip single instance lock in test environment to allow multiple test instances
const gotTheLock = process.env.NODE_ENV === 'test' ? true : app.requestSingleInstanceLock();

logger.info(`Single instance lock: ${gotTheLock ? 'ACQUIRED' : 'FAILED'}`);
logger.info(`Process args: ${JSON.stringify(process.argv)}`);
logger.info(`Process defaultApp: ${process.defaultApp}`);

// Requirements: google-oauth-auth.2.1
// Extract protocol scheme from redirect URI for deep link handling
const protocolScheme = OAUTH_CONFIG.redirectUri.split(':')[0];
logger.info(`Protocol scheme: ${protocolScheme}`);

// Track application initialization state
let isAppInitialized = false;
let pendingDeepLink: string | null = null;

if (!gotTheLock) {
  logger.info('Another instance is already running');

  // Check if this instance was launched with a deep link
  const launchUrl = process.argv.find((arg) => arg.startsWith(protocolScheme));
  if (launchUrl) {
    logger.info(`This instance has deep link, will pass to primary instance: ${launchUrl}`);
    // The deep link will be passed to the primary instance via second-instance event
  }

  logger.info('Quitting secondary instance...');
  app.quit();
} else {
  logger.info('This is the primary instance');

  // Handle custom user data directory for functional tests
  // Check for --user-data-dir argument
  const userDataDirIndex = process.argv.indexOf('--user-data-dir');
  if (userDataDirIndex !== -1 && process.argv[userDataDirIndex + 1]) {
    const customUserDataPath = process.argv[userDataDirIndex + 1];
    app.setPath('userData', customUserDataPath);
    logger.info(`Using custom user data path: ${customUserDataPath}`);
  }

  // Register custom protocol for deep link handling
  // Using reverse client ID format: com.googleusercontent.apps.CLIENT_ID
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      const execPath = process.execPath;
      // In dev mode, we need to register with the full path to the entry point
      // Get the absolute path to the main file
      const mainPath = path.resolve(__dirname, 'index.js');
      logger.info(`Registering protocol in dev mode: ${JSON.stringify({ execPath, mainPath })}`);
      app.setAsDefaultProtocolClient(protocolScheme, execPath, [mainPath]);
    }
  } else {
    logger.info('Registering protocol in production mode');
    app.setAsDefaultProtocolClient(protocolScheme);
  }
}

// Requirements: clerkly.1.4
// Initialize Data Manager with user data path
const userDataPath = app.getPath('userData');
const storagePath = path.join(userDataPath, 'storage');
const dataManager = new DataManager(storagePath);

// Requirements: testing.3.1, testing.3.2
// Helper function to check if we're in test environment
const isTestEnvironment = () => {
  return process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === '1';
};

// Create TestDataManager wrapper in test environment
import { TestDataManager } from './TestDataManager';
let testDataManager: TestDataManager | null = null;
if (isTestEnvironment()) {
  testDataManager = new TestDataManager(dataManager);
  logger.info('TestDataManager created for test environment');
}

// Check if app was launched with a deep link
const launchUrl = process.argv.find((arg) => arg.startsWith(protocolScheme));
if (launchUrl) {
  logger.info(`App launched with deep link: ${launchUrl}`);
  pendingDeepLink = launchUrl;
}

// Requirements: google-oauth-auth.4.1, google-oauth-auth.4.2
// Initialize Token Storage Manager
const tokenStorage = new TokenStorageManager(dataManager);

// Requirements: google-oauth-auth.1.1, google-oauth-auth.2.2
// Initialize OAuth Client Manager
const oauthConfig = getOAuthConfig();
const oauthClient = new OAuthClientManager(oauthConfig, tokenStorage);

// Requirements: token-management-ui.1.1, token-management-ui.1.2
// Set OAuth Client Manager for automatic token refresh in API requests
import { setOAuthClientManager } from './auth/APIRequestHandler';
setOAuthClientManager(oauthClient);

// Requirements: account-profile.1.5
// Initialize User Profile Manager
const profileManager = new UserProfileManager(dataManager, oauthClient, tokenStorage);

// Requirements: user-data-isolation.1.10 - Set UserProfileManager in DataManager for data isolation
dataManager.setUserProfileManager(profileManager);

// Requirements: account-profile.1.5
// Connect profile manager to oauth client for automatic updates
oauthClient.setProfileManager(profileManager);

// Requirements: clerkly.1.2, clerkly.1.3, window-management.5
// Initialize Window Manager
const windowManager = new WindowManager(dataManager, profileManager);

// Requirements: google-oauth-auth.11.1
// Initialize Auth Window Manager
import { AuthWindowManager } from './auth/AuthWindowManager';
const authWindowManager = new AuthWindowManager(windowManager, oauthClient);

// Requirements: google-oauth-auth.7.1
// Connect auth window manager to oauth client for loader display
oauthClient.setAuthWindowManager(authWindowManager);

// Requirements: clerkly.1.2, clerkly.1.3, clerkly.1.4, account-profile.1.5
// Initialize Lifecycle Manager
const lifecycleManager = new LifecycleManager(
  windowManager,
  dataManager,
  oauthClient,
  tokenStorage
);

// Requirements: clerkly.1.4, clerkly.2.5
// Initialize IPC Handlers
const ipcHandlers = new IPCHandlers(dataManager);

// Requirements: google-oauth-auth.8.1, account-profile.1.2
// Initialize Auth IPC Handlers
const authIPCHandlers = new AuthIPCHandlers(oauthClient);
// Requirements: account-profile.1.2 - Connect profile manager to auth IPC handlers
authIPCHandlers.setProfileManager(profileManager);

// Requirements: settings.1.9, settings.1.26
// Initialize AI Agent Settings Manager
// Use TestDataManager in test environment for error simulation
const aiAgentSettingsManager = new AIAgentSettingsManager(
  isTestEnvironment() && testDataManager ? testDataManager : dataManager
);

// Requirements: settings.1.9, settings.1.26
// Initialize Settings IPC Handlers
const settingsIPCHandlers = new SettingsIPCHandlers(aiAgentSettingsManager);

// Requirements: testing.3.8
// Initialize Test IPC Handlers (only in test environment)
if (process.env.NODE_ENV === 'test') {
  // Export test context for functional tests
  // This allows tests to access internal state like PKCE storage
  (global as any).testContext = {
    oauthClient,
    tokenStorage,
    profileManager,
    dataManager,
  };

  // Register test IPC handlers inline to avoid import issues
  // Requirements: testing.3.1.2 - Test IPC handlers for functional tests
  const { ipcMain } = require('electron');

  ipcMain.handle('test:clear-tokens', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:clear-tokens can only be used in test environment');
    }
    await tokenStorage.deleteTokens();
    return { success: true };
  });

  ipcMain.handle('test:clear-data', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:clear-data can only be used in test environment');
    }
    const db = (dataManager as any).db;
    db.prepare('DELETE FROM user_data').run();
    return { success: true };
  });

  ipcMain.handle('test:trigger-auth-success', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:trigger-auth-success can only be used in test environment');
    }
    // Fetch profile after auth success
    try {
      await profileManager.fetchProfile();
      authIPCHandlers.sendAuthSuccess();
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch profile: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('test:get-profile', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:get-profile can only be used in test environment');
    }
    try {
      const profile = await profileManager.loadProfile();
      return { success: true, profile };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage, profile: null };
    }
  });

  ipcMain.handle('test:get-profile-by-email', async (_event: any, email: string) => {
    if (!isTestEnvironment()) {
      throw new Error('test:get-profile-by-email can only be used in test environment');
    }
    if (!email || typeof email !== 'string') {
      return { success: false, error: 'Email parameter is required', profile: null };
    }
    try {
      const profile = await profileManager.loadProfileByEmail(email);
      return { success: true, profile };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage, profile: null };
    }
  });

  ipcMain.handle('test:setup-profile', async (_event: any, profileData: any) => {
    if (!isTestEnvironment()) {
      throw new Error('test:setup-profile can only be used in test environment');
    }
    try {
      await profileManager.saveProfile(profileData);
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });

  // Requirements: user-data-isolation.1.3, user-data-isolation.1.4, user-data-isolation.1.13
  // Test handlers for data isolation testing
  ipcMain.handle('test:save-data', async (_event: any, key: string, value: string) => {
    if (!isTestEnvironment()) {
      throw new Error('test:save-data can only be used in test environment');
    }
    try {
      const result = dataManager.saveData(key, value);

      // Check if result indicates error
      if (!result.success) {
        return result; // Return the error result
      }

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('test:load-data', async (_event: any, key: string) => {
    if (!isTestEnvironment()) {
      throw new Error('test:load-data can only be used in test environment');
    }
    try {
      const result = await dataManager.loadData(key);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('test:delete-data', async (_event: any, key: string) => {
    if (!isTestEnvironment()) {
      throw new Error('test:delete-data can only be used in test environment');
    }
    try {
      await dataManager.deleteData(key);
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });

  // Test handler for triggering deep link handling
  ipcMain.handle('test:handle-deep-link', async (_event: any, url: string) => {
    if (!isTestEnvironment()) {
      throw new Error('test:handle-deep-link can only be used in test environment');
    }
    try {
      logger.info(`Handling deep link: ${url}`);
      const authStatus = await oauthClient.handleDeepLink(url);
      logger.info(`Deep link auth status: ${JSON.stringify(authStatus)}`);

      // Send auth events to renderer (same as handleDeepLinkUrl does)
      if (authStatus.authorized) {
        logger.info('Authorization successful, sending auth success');
        authIPCHandlers.sendAuthSuccess();
      } else if (authStatus.error) {
        logger.info(`Authorization failed, sending auth error: ${authStatus.error}`);
        authIPCHandlers.sendAuthError(authStatus.error, authStatus.error);
      }

      return authStatus;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Deep link handling error: ${errorMessage}`);
      return { authorized: false, error: errorMessage };
    }
  });

  ipcMain.handle(
    'test:trigger-error-notification',
    async (event: any, data: { message: string; context: string }) => {
      if (!isTestEnvironment()) {
        throw new Error('test:trigger-error-notification can only be used in test environment');
      }
      try {
        // Send error notification to renderer process using AuthIPCHandlers
        // This simulates what happens when Main Process encounters an error
        authIPCHandlers.sendErrorNotification(data.message, data.context);
        logger.info(`Sent error notification via AuthIPCHandlers: ${JSON.stringify(data)}`);
        return { success: true };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error sending notification: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Test handler for expiring tokens (to test automatic token refresh)
  ipcMain.handle('test:expire-token', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:expire-token can only be used in test environment');
    }
    try {
      // Load current tokens
      const tokens = await tokenStorage.loadTokens();
      if (!tokens) {
        return { success: false, error: 'No tokens found' };
      }

      // Set expiresAt to past (1 second ago) to simulate expired token
      const expiredTokens = {
        ...tokens,
        expiresAt: Date.now() - 1000,
      };

      // Save expired tokens
      await tokenStorage.saveTokens(expiredTokens);
      logger.info('Token expiration simulated for testing');

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to expire token: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  // Requirements: testing.3.9 - Test helper to get current tokens
  ipcMain.handle('test:get-tokens', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:get-tokens can only be used in test environment');
    }
    try {
      const tokens = await tokenStorage.loadTokens();
      if (!tokens) {
        return { success: false, error: 'No tokens found' };
      }

      return {
        success: true,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get tokens: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  // Requirements: testing.3.1, testing.3.2 - Test helper to simulate data errors
  ipcMain.handle(
    'test:simulate-data-error',
    async (
      _event: any,
      operation: 'saveData' | 'loadData' | 'deleteData',
      errorMessage: string
    ) => {
      if (!isTestEnvironment()) {
        throw new Error('test:simulate-data-error can only be used in test environment');
      }
      if (!testDataManager) {
        return { success: false, error: 'TestDataManager not initialized' };
      }

      testDataManager.simulateError(operation, errorMessage);
      return { success: true };
    }
  );

  // Requirements: testing.3.1, testing.3.2 - Test helper to clear error simulations
  ipcMain.handle('test:clear-data-errors', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:clear-data-errors can only be used in test environment');
    }
    if (!testDataManager) {
      return { success: false, error: 'TestDataManager not initialized' };
    }

    testDataManager.clearErrorSimulations();
    return { success: true };
  });

  logger.info('Test IPC handlers registered');
}

// Requirements: clerkly.1.1, clerkly.1.2
// Handle application ready event
app.whenReady().then(async () => {
  try {
    logger.info('Application starting...');
    const startTime = Date.now();

    // Requirements: user-data-isolation.1.17 - Initialize profile manager to restore email from database
    await profileManager.initialize();
    logger.info('UserProfileManager initialized');

    // Requirements: clerkly.1.2, clerkly.1.3, clerkly.1.4
    // Initialize application
    const initResult = await lifecycleManager.initialize();

    if (!initResult.success) {
      logger.error('Application initialization failed');
      app.quit();
      return;
    }

    const loadTime = Date.now() - startTime;
    logger.info(`Application started successfully in ${loadTime}ms`);

    // Requirements: clerkly.nfr.1.1
    // Warn if startup time exceeds 3 seconds
    if (loadTime > 3000) {
      logger.warn(`Slow startup detected: ${loadTime}ms (target: <3000ms)`);
    }

    // Requirements: clerkly.1.4, clerkly.2.5
    // Register IPC handlers
    ipcHandlers.registerHandlers();
    logger.info('IPC handlers registered');

    // Requirements: google-oauth-auth.8.1
    // Register Auth IPC handlers
    authIPCHandlers.registerHandlers();
    logger.info('Auth IPC handlers registered');

    // Requirements: settings.1.9, settings.1.26
    // Register Settings IPC handlers
    settingsIPCHandlers.registerHandlers();
    logger.info('Settings IPC handlers registered');

    // Requirements: google-oauth-auth.11.1
    // Initialize Auth Window Manager to check auth status and show appropriate window
    await authWindowManager.initializeApp();
    logger.info('Auth Window Manager initialized');

    logger.info('Main window created and loaded');

    // Mark app as initialized
    isAppInitialized = true;

    // Process pending deep link if any
    if (pendingDeepLink) {
      logger.info(`Processing pending deep link: ${pendingDeepLink}`);
      await handleDeepLinkUrl(pendingDeepLink);
      pendingDeepLink = null;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Startup error: ${errorMessage}`);
    app.quit();
  }
});

// Requirements: clerkly.1.2, clerkly.1.3
// Handle activate event (Mac OS X specific)
app.on('activate', () => {
  logger.info('Application activated');
  lifecycleManager.handleActivation();
});

// Requirements: clerkly.1.2
// Handle window-all-closed event
app.on('window-all-closed', () => {
  logger.info('All windows closed');
  // On macOS, keep app running even when all windows are closed
  // This allows deep link handling to work properly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Requirements: clerkly.1.2
// Handle before-quit event
app.on('before-quit', () => {
  logger.info('Application quitting...');
  lifecycleManager.handleWindowClose();
});

/**
 * Handle deep link URL processing
 * Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5, account-profile.1.2, account-profile.1.3
 * @param url Deep link URL to process
 */
async function handleDeepLinkUrl(url: string): Promise<void> {
  if (!url.startsWith(protocolScheme)) {
    return;
  }

  try {
    logger.info(`Handling deep link: ${url}`);

    // Handle deep link first
    const authStatus = await oauthClient.handleDeepLink(url);
    logger.info(`Deep link auth status: ${JSON.stringify(authStatus)}`);

    // Get main window
    const mainWindow = BrowserWindow.getAllWindows()[0];

    if (mainWindow) {
      // Send auth event to renderer
      // Requirements: google-oauth-auth.3.6, google-oauth-auth.3.7, google-oauth-auth.3.8
      // Profile is already fetched synchronously inside handleDeepLink()
      if (authStatus.authorized) {
        logger.info('Authorization successful, profile already fetched, sending auth success');
        authIPCHandlers.sendAuthSuccess();
      } else if (authStatus.error) {
        logger.info(`Sending auth error event: ${authStatus.error}`);
        authIPCHandlers.sendAuthError(authStatus.error, authStatus.error);
      }

      // Focus and restore window
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.show();
    } else {
      logger.warn('No window available to send auth event');
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Deep link handling error: ${errorMessage}`);

    // Try to send error to window if available
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      authIPCHandlers.sendAuthError(errorMessage, 'unknown_error');
    }
  }
}

// Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
// Handle deep link on macOS (open-url event)
app.on('open-url', async (event, url) => {
  event.preventDefault();
  logger.info(`open-url event received: ${url}`);

  if (!url.startsWith(protocolScheme)) {
    return;
  }

  // If app is not initialized yet, store the deep link for later processing
  if (!isAppInitialized) {
    logger.info('App not initialized yet, storing deep link for later');
    pendingDeepLink = url;
    return;
  }

  // Process deep link immediately if app is initialized
  await handleDeepLinkUrl(url);
});

// Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
// Handle deep link on Windows/Linux (second-instance event)
// Single instance lock is already requested at the top of the file
app.on('second-instance', async (_event, commandLine, _workingDirectory) => {
  logger.info('second-instance event received');
  logger.info(`Command line args: ${JSON.stringify(commandLine)}`);

  // Find deep link URL in command line arguments
  const url = commandLine.find((arg) => arg.startsWith(protocolScheme));
  if (url) {
    logger.info(`Deep link found in second-instance: ${url}`);

    // If app is not initialized yet, store the deep link for later processing
    if (!isAppInitialized) {
      logger.info('App not initialized yet, storing deep link for later');
      pendingDeepLink = url;
    } else {
      // Process deep link immediately if app is initialized
      await handleDeepLinkUrl(url);
    }
  } else {
    logger.info('No deep link in command line, just activating window');
    // No deep link, just activate the window
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  }
});
