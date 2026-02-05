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
import { getOAuthConfig, OAUTH_CONFIG } from './auth/OAuthConfig';
import { AuthIPCHandlers } from './auth/AuthIPCHandlers';

// Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
// Request single instance lock BEFORE registering protocol
// This ensures that deep links are handled by the existing instance
const gotTheLock = app.requestSingleInstanceLock();

// Requirements: google-oauth-auth.2.1
// Extract protocol scheme from redirect URI for deep link handling
const protocolScheme = OAUTH_CONFIG.redirectUri.split(':')[0];

if (!gotTheLock) {
  app.quit();
} else {
  // Handle custom user data directory for functional tests
  // Check for --user-data-dir argument
  const userDataDirIndex = process.argv.indexOf('--user-data-dir');
  if (userDataDirIndex !== -1 && process.argv[userDataDirIndex + 1]) {
    const customUserDataPath = process.argv[userDataDirIndex + 1];
    app.setPath('userData', customUserDataPath);
  }

  // Register custom protocol for deep link handling
  // Using reverse client ID format: com.googleusercontent.apps.CLIENT_ID
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      const execPath = process.execPath;
      // In dev mode, point to the compiled main file
      const mainPath = path.join(__dirname, 'index.js');
      app.setAsDefaultProtocolClient(protocolScheme, execPath, [mainPath]);
    }
  } else {
    app.setAsDefaultProtocolClient(protocolScheme);
  }
}

// Requirements: clerkly.1.4
// Initialize Data Manager with user data path
const userDataPath = app.getPath('userData');
const storagePath = path.join(userDataPath, 'storage');
const dataManager = new DataManager(storagePath);

// Requirements: google-oauth-auth.4.1, google-oauth-auth.4.2
// Initialize Token Storage Manager
const tokenStorage = new TokenStorageManager(dataManager);

// Requirements: google-oauth-auth.1.1, google-oauth-auth.2.2
// Initialize OAuth Client Manager
const oauthConfig = getOAuthConfig();
const oauthClient = new OAuthClientManager(oauthConfig, tokenStorage);

// Requirements: clerkly.1.2, clerkly.1.3, ui.5
// Initialize Window Manager
const windowManager = new WindowManager(dataManager);

// Requirements: google-oauth-auth.14.1
// Initialize Auth Window Manager
import { AuthWindowManager } from './auth/AuthWindowManager';
const authWindowManager = new AuthWindowManager(windowManager, oauthClient);

// Requirements: clerkly.1.2, clerkly.1.3, clerkly.1.4
// Initialize Lifecycle Manager
const lifecycleManager = new LifecycleManager(windowManager, dataManager);

// Requirements: clerkly.1.4, clerkly.2.5
// Initialize IPC Handlers
const ipcHandlers = new IPCHandlers(dataManager);

// Requirements: google-oauth-auth.8.1
// Initialize Auth IPC Handlers
const authIPCHandlers = new AuthIPCHandlers(oauthClient);

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

// Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
// Handle deep link on macOS (open-url event)
app.on('open-url', async (event, url) => {
  event.preventDefault();

  if (url.startsWith(protocolScheme)) {
    try {
      // Handle deep link first
      const authStatus = await oauthClient.handleDeepLink(url);

      // Check if app is already initialized
      const existingWindows = BrowserWindow.getAllWindows();

      if (existingWindows.length > 0) {
        // App is already running
        const mainWindow = existingWindows[0];

        // Send auth event to renderer
        if (authStatus.authorized) {
          authIPCHandlers.sendAuthSuccess();
        } else if (authStatus.error) {
          authIPCHandlers.sendAuthError(authStatus.error, authStatus.error);
        }

        mainWindow.focus();
      } else {
        // App is not initialized yet, initialize it now

        // Initialize application
        const initResult = await lifecycleManager.initialize();
        if (!initResult.success) {
          console.error('[Main] Application initialization failed');
          app.quit();
          return;
        }

        // Register IPC handlers
        ipcHandlers.registerHandlers();
        authIPCHandlers.registerHandlers();

        // Initialize Auth Window Manager (will show Dashboard if authorized)
        await authWindowManager.initializeApp();

        // Focus the new window
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          mainWindow.focus();
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Main] Deep link handling error:', errorMessage);
    }
  }
});

// Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
// Handle deep link on Windows/Linux (second-instance event)
// Single instance lock is already requested at the top of the file
app.on('second-instance', async (_event, commandLine, _workingDirectory) => {
  // Find deep link URL in command line arguments
  const url = commandLine.find((arg) => arg.startsWith(protocolScheme));
  if (url) {
    try {
      const authStatus = await oauthClient.handleDeepLink(url);

      // Send auth event to renderer
      if (authStatus.authorized) {
        authIPCHandlers.sendAuthSuccess();
      } else if (authStatus.error) {
        authIPCHandlers.sendAuthError(authStatus.error, authStatus.error);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Main] Deep link handling error:', errorMessage);
      authIPCHandlers.sendAuthError(errorMessage, 'unknown_error');
    }
  }

  // Activate application window
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});
