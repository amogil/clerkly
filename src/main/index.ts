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
import { getOAuthConfig } from './auth/OAuthConfig';
import { AuthIPCHandlers } from './auth/AuthIPCHandlers';

// Requirements: google-oauth-auth.2.1
// Register custom protocol for deep link handling
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('clerkly', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('clerkly');
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
  // Quit the app when all windows are closed (including macOS)
  app.quit();
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
  console.log('[Main] Deep link received:', url);

  if (url.startsWith('clerkly://')) {
    try {
      const authStatus = await oauthClient.handleDeepLink(url);
      console.log('[Main] Deep link handled:', authStatus);

      // Send event to renderer processes
      if (authStatus.authorized) {
        authIPCHandlers.sendAuthSuccess();
      } else if (authStatus.error) {
        authIPCHandlers.sendAuthError(authStatus.error, authStatus.error);
      }

      // Activate application window
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Main] Deep link handling error:', errorMessage);
      authIPCHandlers.sendAuthError(errorMessage, 'unknown_error');
    }
  }
});

// Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
// Handle deep link on Windows/Linux (second-instance event)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', async (event, commandLine, _workingDirectory) => {
    console.log('[Main] Second instance detected');

    // Find deep link URL in command line arguments
    const url = commandLine.find((arg) => arg.startsWith('clerkly://'));
    if (url) {
      console.log('[Main] Deep link received:', url);

      try {
        const authStatus = await oauthClient.handleDeepLink(url);
        console.log('[Main] Deep link handled:', authStatus);

        // Send event to renderer processes
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
}
