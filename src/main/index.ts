// Requirements: clerkly.1.1, clerkly.1.2, clerkly.1.3, clerkly.1.4

/**
 * Main entry point for Clerkly Electron application
 * Initializes all components and manages application lifecycle
 */

import { app } from 'electron';
import * as path from 'path';
import WindowManager from './WindowManager';
import { LifecycleManager } from './LifecycleManager';
import { DataManager } from './DataManager';
import { IPCHandlers } from './IPCHandlers';

// Requirements: clerkly.1.4
// Initialize Data Manager with user data path
const userDataPath = app.getPath('userData');
const storagePath = path.join(userDataPath, 'storage');
const dataManager = new DataManager(storagePath);

// Requirements: clerkly.1.2, clerkly.1.3
// Initialize Window Manager
const windowManager = new WindowManager();

// Requirements: clerkly.1.2, clerkly.1.3, clerkly.1.4
// Initialize Lifecycle Manager
const lifecycleManager = new LifecycleManager(windowManager, dataManager);

// Requirements: clerkly.1.4, clerkly.2.5
// Initialize IPC Handlers
const ipcHandlers = new IPCHandlers(dataManager);

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
      console.warn(
        `[Main] Slow startup detected: ${loadTime}ms (target: <3000ms)`
      );
    }

    // Requirements: clerkly.1.4, clerkly.2.5
    // Register IPC handlers
    ipcHandlers.registerHandlers();
    console.log('[Main] IPC handlers registered');

    // Requirements: clerkly.1.2, clerkly.1.3
    // Create main window
    const mainWindow = windowManager.createWindow();

    // Load renderer HTML
    const rendererPath = path.join(__dirname, '../renderer/index.html');
    await mainWindow.loadFile(rendererPath);

    console.log('[Main] Main window created and loaded');
  } catch (error: any) {
    console.error('[Main] Startup error:', error.message);
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
  lifecycleManager.handleWindowClose();
});

// Requirements: clerkly.1.2
// Handle before-quit event
app.on('before-quit', () => {
  console.log('[Main] Application quitting...');
});
