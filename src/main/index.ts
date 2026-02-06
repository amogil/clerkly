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

// Set app name for single instance lock
// This helps macOS identify the app correctly
app.setName('Clerkly');

// Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
// Request single instance lock BEFORE registering protocol
// This ensures that deep links are handled by the existing instance
// Skip single instance lock in test environment to allow multiple test instances
const gotTheLock = process.env.NODE_ENV === 'test' ? true : app.requestSingleInstanceLock();

console.log('[Main] Single instance lock:', gotTheLock ? 'ACQUIRED' : 'FAILED');
console.log('[Main] Process args:', process.argv);
console.log('[Main] Process defaultApp:', process.defaultApp);

// Requirements: google-oauth-auth.2.1
// Extract protocol scheme from redirect URI for deep link handling
const protocolScheme = OAUTH_CONFIG.redirectUri.split(':')[0];
console.log('[Main] Protocol scheme:', protocolScheme);

// Track application initialization state
let isAppInitialized = false;
let pendingDeepLink: string | null = null;

if (!gotTheLock) {
  console.log('[Main] Another instance is already running');

  // Check if this instance was launched with a deep link
  const launchUrl = process.argv.find((arg) => arg.startsWith(protocolScheme));
  if (launchUrl) {
    console.log('[Main] This instance has deep link, will pass to primary instance:', launchUrl);
    // The deep link will be passed to the primary instance via second-instance event
  }

  console.log('[Main] Quitting secondary instance...');
  app.quit();
} else {
  console.log('[Main] This is the primary instance');

  // Handle custom user data directory for functional tests
  // Check for --user-data-dir argument
  const userDataDirIndex = process.argv.indexOf('--user-data-dir');
  if (userDataDirIndex !== -1 && process.argv[userDataDirIndex + 1]) {
    const customUserDataPath = process.argv[userDataDirIndex + 1];
    app.setPath('userData', customUserDataPath);
    console.log('[Main] Using custom user data path:', customUserDataPath);
  }

  // Register custom protocol for deep link handling
  // Using reverse client ID format: com.googleusercontent.apps.CLIENT_ID
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      const execPath = process.execPath;
      // In dev mode, we need to register with the full path to the entry point
      // Get the absolute path to the main file
      const mainPath = path.resolve(__dirname, 'index.js');
      console.log('[Main] Registering protocol in dev mode:', { execPath, mainPath });
      app.setAsDefaultProtocolClient(protocolScheme, execPath, [mainPath]);
    }
  } else {
    console.log('[Main] Registering protocol in production mode');
    app.setAsDefaultProtocolClient(protocolScheme);
  }
}

// Requirements: clerkly.1.4
// Initialize Data Manager with user data path
const userDataPath = app.getPath('userData');
const storagePath = path.join(userDataPath, 'storage');
const dataManager = new DataManager(storagePath);

// Check if app was launched with a deep link
const launchUrl = process.argv.find((arg) => arg.startsWith(protocolScheme));
if (launchUrl) {
  console.log('[Main] App launched with deep link:', launchUrl);
  pendingDeepLink = launchUrl;
}

// Requirements: google-oauth-auth.4.1, google-oauth-auth.4.2
// Initialize Token Storage Manager
const tokenStorage = new TokenStorageManager(dataManager);

// Requirements: google-oauth-auth.1.1, google-oauth-auth.2.2
// Initialize OAuth Client Manager
const oauthConfig = getOAuthConfig();
const oauthClient = new OAuthClientManager(oauthConfig, tokenStorage);

// Requirements: ui.6.5
// Initialize User Profile Manager
const profileManager = new UserProfileManager(dataManager, oauthClient, tokenStorage);

// Requirements: ui.6.5
// Connect profile manager to oauth client for automatic updates
oauthClient.setProfileManager(profileManager);

// Requirements: clerkly.1.2, clerkly.1.3, ui.5
// Initialize Window Manager
const windowManager = new WindowManager(dataManager);

// Requirements: google-oauth-auth.14.1
// Initialize Auth Window Manager
import { AuthWindowManager } from './auth/AuthWindowManager';
const authWindowManager = new AuthWindowManager(windowManager, oauthClient);

// Requirements: clerkly.1.2, clerkly.1.3, clerkly.1.4, ui.6.5
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

// Requirements: google-oauth-auth.8.1, ui.6.2
// Initialize Auth IPC Handlers
const authIPCHandlers = new AuthIPCHandlers(oauthClient);
// Requirements: ui.6.2 - Connect profile manager to auth IPC handlers
authIPCHandlers.setProfileManager(profileManager);

// Requirements: testing.3.8
// Initialize Test IPC Handlers (only in test environment)
if (process.env.NODE_ENV === 'test') {
  // Register test IPC handlers inline to avoid import issues
  const { ipcMain } = require('electron');

  ipcMain.handle('test:setup-tokens', async (_event: any, tokens: any) => {
    await tokenStorage.saveTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
      tokenType: tokens.tokenType || 'Bearer',
    });
    return { success: true };
  });

  ipcMain.handle('test:clear-tokens', async () => {
    await tokenStorage.deleteTokens();
    return { success: true };
  });

  ipcMain.handle('test:get-token-status', async () => {
    const tokens = await tokenStorage.loadTokens();
    return {
      hasTokens: !!tokens,
      accessToken: tokens?.accessToken ? '***' : null,
      refreshToken: tokens?.refreshToken ? '***' : null,
      expiresAt: tokens?.expiresAt || null,
    };
  });

  ipcMain.handle('test:clear-data', async () => {
    const db = (dataManager as any).db;
    db.prepare('DELETE FROM user_data').run();
    return { success: true };
  });

  ipcMain.handle('test:trigger-auth-success', async () => {
    // Fetch profile after auth success
    try {
      await profileManager.fetchProfile();
      authIPCHandlers.sendAuthSuccess();
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TEST] Failed to fetch profile:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('test:get-profile', async () => {
    try {
      const profile = await profileManager.loadProfile();
      return { success: true, profile };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage, profile: null };
    }
  });

  ipcMain.handle('test:setup-profile', async (_event: any, profileData: any) => {
    try {
      await profileManager.saveProfile(profileData);
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('test:trigger-error-notification', async (event: any, data: { message: string; context: string }) => {
    try {
      // Send error notification to renderer process
      // This simulates what happens when Main Process encounters an error
      // Use WindowManager to send to main window
      const mainWindow = windowManager.getWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('error:notify', data.message, data.context);
        console.log('[TEST] Sent error:notify event to main window:', data);
      } else {
        console.log('[TEST] Main window not available, using event.sender');
        event.sender.send('error:notify', data.message, data.context);
      }
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TEST] Error sending notification:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  console.log('[TEST] Test IPC handlers registered');
}

// Requirements: clerkly.1.1, clerkly.1.2
// Handle application ready event
app.whenReady().then(async () => {
  try {
    console.log('[Main] Application starting...');
    const startTime = Date.now();

    // Requirements: clerkly.1.2, clerkly.1.3, clerkly.1.4
    // Initialize application
    const initResult = await lifecycleManager.initialize();

    if (!initResult.success) {
      console.error('[Main] Application initialization failed');
      app.quit();
      return;
    }

    const loadTime = Date.now() - startTime;
    console.log(`[Main] Application started successfully in ${loadTime}ms`);

    // Requirements: clerkly.nfr.1.1
    // Warn if startup time exceeds 3 seconds
    if (loadTime > 3000) {
      console.warn(`[Main] Slow startup detected: ${loadTime}ms (target: <3000ms)`);
    }

    // Requirements: clerkly.1.4, clerkly.2.5
    // Register IPC handlers
    ipcHandlers.registerHandlers();
    console.log('[Main] IPC handlers registered');

    // Requirements: google-oauth-auth.8.1
    // Register Auth IPC handlers
    authIPCHandlers.registerHandlers();
    console.log('[Main] Auth IPC handlers registered');

    // Requirements: google-oauth-auth.14.1
    // Initialize Auth Window Manager to check auth status and show appropriate window
    await authWindowManager.initializeApp();
    console.log('[Main] Auth Window Manager initialized');

    console.log('[Main] Main window created and loaded');

    // Mark app as initialized
    isAppInitialized = true;

    // Process pending deep link if any
    if (pendingDeepLink) {
      console.log('[Main] Processing pending deep link:', pendingDeepLink);
      await handleDeepLinkUrl(pendingDeepLink);
      pendingDeepLink = null;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Main] Startup error:', errorMessage);
    app.quit();
  }
});

// Requirements: clerkly.1.2, clerkly.1.3
// Handle activate event (Mac OS X specific)
app.on('activate', () => {
  console.log('[Main] Application activated');
  lifecycleManager.handleActivation();
});

// Requirements: clerkly.1.2
// Handle window-all-closed event
app.on('window-all-closed', () => {
  console.log('[Main] All windows closed');
  // On macOS, keep app running even when all windows are closed
  // This allows deep link handling to work properly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Requirements: clerkly.1.2
// Handle before-quit event
app.on('before-quit', () => {
  console.log('[Main] Application quitting...');
  lifecycleManager.handleWindowClose();
});

/**
 * Handle deep link URL processing
 * Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
 * @param url Deep link URL to process
 */
async function handleDeepLinkUrl(url: string): Promise<void> {
  if (!url.startsWith(protocolScheme)) {
    return;
  }

  try {
    console.log('[Main] Handling deep link:', url);

    // Handle deep link first
    const authStatus = await oauthClient.handleDeepLink(url);
    console.log('[Main] Deep link auth status:', authStatus);

    // Get main window
    const mainWindow = BrowserWindow.getAllWindows()[0];

    if (mainWindow) {
      // Send auth event to renderer
      if (authStatus.authorized) {
        console.log('[Main] Sending auth success event');

        // Requirements: ui.6.2 - Fetch profile after successful authentication
        try {
          await profileManager.fetchProfile();
          console.log('[Main] Profile fetched successfully after OAuth');
        } catch (profileError: unknown) {
          const profileErrorMessage =
            profileError instanceof Error ? profileError.message : 'Unknown error';
          console.error('[Main] Failed to fetch profile after OAuth:', profileErrorMessage);
          // Continue anyway - user is authenticated, profile can be fetched later
        }

        authIPCHandlers.sendAuthSuccess();
      } else if (authStatus.error) {
        console.log('[Main] Sending auth error event:', authStatus.error);
        authIPCHandlers.sendAuthError(authStatus.error, authStatus.error);
      }

      // Focus and restore window
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.show();
    } else {
      console.warn('[Main] No window available to send auth event');
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Main] Deep link handling error:', errorMessage);

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
  console.log('[Main] open-url event received:', url);

  if (!url.startsWith(protocolScheme)) {
    return;
  }

  // If app is not initialized yet, store the deep link for later processing
  if (!isAppInitialized) {
    console.log('[Main] App not initialized yet, storing deep link for later');
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
  console.log('[Main] second-instance event received');
  console.log('[Main] Command line args:', commandLine);

  // Find deep link URL in command line arguments
  const url = commandLine.find((arg) => arg.startsWith(protocolScheme));
  if (url) {
    console.log('[Main] Deep link found in second-instance:', url);

    // If app is not initialized yet, store the deep link for later processing
    if (!isAppInitialized) {
      console.log('[Main] App not initialized yet, storing deep link for later');
      pendingDeepLink = url;
    } else {
      // Process deep link immediately if app is initialized
      await handleDeepLinkUrl(url);
    }
  } else {
    console.log('[Main] No deep link in command line, just activating window');
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
