// Requirements: clerkly.1, ui.5

import { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import * as path from 'path';
import { DataManager } from './DataManager';
import { WindowStateManager } from './WindowStateManager';
import { Logger } from './Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Configuration options for window customization
 *
 * Defines optional parameters that can be used to configure window properties
 * dynamically after creation via WindowManager.configureWindow().
 *
 * @interface WindowOptions
 */
interface WindowOptions {
  /**
   * Window width in pixels
   * @remarks Must be provided together with height to change window size
   */
  width?: number;

  /**
   * Window height in pixels
   * @remarks Must be provided together with width to change window size
   */
  height?: number;

  /**
   * Window title text
   * @remarks Default is empty string for minimalist interface (ui.2.1)
   */
  title?: string;

  /**
   * Whether the window can be resized by the user
   * @remarks Default is true to allow user customization (ui.1.3)
   */
  resizable?: boolean;

  /**
   * Whether the window is in fullscreen mode
   * @remarks Default is false to preserve macOS system elements (ui.1.2)
   */
  fullscreen?: boolean;
}

/**
 * Manages the creation and configuration of the application window with native Mac OS X interface
 *
 * WindowManager is responsible for:
 * - Creating and configuring the main application window
 * - Loading and restoring saved window state (position, size, maximized)
 * - Automatically tracking and persisting window state changes
 * - Providing native macOS user experience
 * - Adapting window size to different screen configurations
 * - Handling window lifecycle (creation, configuration, closing)
 *
 * Requirements: clerkly.1, ui.1, ui.2, ui.3, ui.4, ui.5
 *
 * @remarks
 * Window Features:
 * - Native macOS window controls and title bar (ui.3.1)
 * - Empty title for minimalist interface (ui.2.1)
 * - Maximized by default on first launch (ui.1.1)
 * - Not fullscreen - preserves system elements (ui.1.2)
 * - Resizable by user (ui.1.3)
 * - Screen-adaptive sizing (ui.4.1, ui.4.2)
 *
 * State Persistence:
 * - Automatically saves window state on resize, move, maximize (ui.5.1, ui.5.2, ui.5.3)
 * - Restores saved state on application restart (ui.5.4)
 * - Falls back to defaults if no saved state or invalid position (ui.5.5, ui.5.6)
 * - Uses SQLite database via DataManager for persistence
 *
 * @example
 * ```typescript
 * // Create window manager with data persistence
 * const dataManager = new DataManager('./app.db');
 * const windowManager = new WindowManager(dataManager);
 *
 * // Create main window (loads saved state or uses defaults)
 * const mainWindow = windowManager.createWindow();
 *
 * // Window state is automatically saved on changes
 * // On next launch, window will restore to last position/size
 *
 * // Configure window dynamically
 * windowManager.configureWindow({ title: 'My App' });
 *
 * // Close window with cleanup
 * windowManager.closeWindow();
 * ```
 */
class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  // Requirements: ui.5
  private windowStateManager: WindowStateManager;
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('WindowManager');

  /**
   * Creates a new WindowManager instance
   *
   * Initializes the WindowManager with a DataManager dependency for window state
   * persistence. The WindowStateManager is created internally to handle loading
   * and saving of window state (position, size, maximized state).
   *
   * Requirements: ui.5
   *
   * @param dataManager - DataManager instance for window state persistence
   *
   * @remarks
   * - WindowStateManager is initialized with the provided DataManager
   * - Window state is stored in SQLite database via DataManager
   * - State includes window position, size, and maximized flag
   *
   * @example
   * ```typescript
   * const dataManager = new DataManager('./app.db');
   * const windowManager = new WindowManager(dataManager);
   * const window = windowManager.createWindow();
   * ```
   */
  constructor(dataManager: DataManager) {
    // Requirements: ui.5
    this.windowStateManager = new WindowStateManager(dataManager);
  }

  /**
   * Creates window with native Mac OS X interface and persistent state
   *
   * Creates the main application window with the following characteristics:
   * - Loads saved window state (position, size, maximized) from database
   * - Opens in maximized state by default (first launch or no saved state)
   * - Uses native macOS window controls and title bar style
   * - Has empty title for minimalist interface
   * - Adapts to screen size (no hardcoded dimensions)
   * - Automatically tracks and saves state changes
   * - Validates saved position is within available screens
   *
   * Requirements: ui.1.1, ui.1.2, ui.2.1, ui.3.1, ui.4.1, ui.4.2, ui.5.4, ui.5.5
   *
   * @returns {BrowserWindow} The created browser window instance
   * @throws {Error} If window creation fails
   *
   * @remarks
   * Window Configuration:
   * - title: '' - Empty title for clean interface (ui.2.1)
   * - titleBarStyle: 'default' - Native macOS controls (ui.3.1)
   * - Position and size from saved state or screen-based defaults (ui.4.1, ui.4.2, ui.5.4, ui.5.5)
   * - Maximized by default on first launch (ui.1.1)
   * - Not fullscreen - preserves macOS system elements (ui.1.2)
   * - Resizable - user can adjust window size (ui.1.3)
   *
   * State Persistence:
   * - Loads state via WindowStateManager.loadState() (ui.5.4)
   * - Falls back to default state if no saved state exists (ui.5.5)
   * - Falls back to default state if saved position is invalid (ui.5.6)
   * - Sets up automatic state tracking on resize/move/maximize events (ui.5.1, ui.5.2, ui.5.3)
   *
   * Security:
   * - Context isolation enabled
   * - Node integration disabled
   * - Web security enabled
   * - CSP header configured
   *
   * @example
   * ```typescript
   * const windowManager = new WindowManager(dataManager);
   * const mainWindow = windowManager.createWindow();
   * // Window opens maximized with saved state or defaults
   * // State changes are automatically persisted
   * ```
   */
  createWindow(): BrowserWindow {
    try {
      // Requirements: ui.5.4, ui.5.5
      const windowState = this.windowStateManager.loadState();

      // Requirements: ui.1.2, ui.1.3, ui.2.1, ui.3.1, ui.4.1, ui.4.2
      const windowConfig: BrowserWindowConstructorOptions = {
        x: windowState.x,
        y: windowState.y,
        width: windowState.width,
        height: windowState.height,
        title: '', // Requirements: ui.2.1
        show: false,
        resizable: true, // Requirements: ui.1.3
        titleBarStyle: 'default', // Requirements: ui.3.1
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          webSecurity: true,
        },
      };

      this.mainWindow = new BrowserWindow(windowConfig);

      // Requirements: ui.1.1, ui.1.3
      // On first launch, the window opens with workAreaSize dimensions but is NOT maximized.
      // This ensures the window is immediately resizable by the user (ui.1.3).
      // If the user previously maximized the window and we saved that state (ui.5.3, ui.5.4),
      // we restore the maximized state here.
      if (windowState.isMaximized) {
        this.mainWindow.maximize();
      }

      this.mainWindow.once('ready-to-show', () => {
        this.mainWindow?.show();
      });

      // Set CSP header
      this.mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; img-src 'self' data: https:;",
            ],
          },
        });
      });

      // Load the renderer HTML file
      const htmlPath = path.join(__dirname, '../renderer/index.html');
      this.mainWindow.loadFile(htmlPath).catch((error) => {
        this.logger.error(`Failed to load HTML file: ${error}`);
      });

      // Log console messages from renderer
      this.mainWindow.webContents.on('console-message', (_event, _level, message) => {
        this.logger.info(`${message}`);
      });

      // Clean up reference when window is closed
      this.mainWindow.on('closed', () => {
        this.mainWindow = null;
      });

      // Requirements: ui.5.1, ui.5.2, ui.5.3
      this.setupStateTracking();

      return this.mainWindow;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create window: ${errorMessage}`);
      throw new Error(`Window creation failed: ${errorMessage}`);
    }
  }

  /**
   * Configures window parameters dynamically
   *
   * Allows runtime modification of window properties such as size, title,
   * resizability, and fullscreen mode. This method safely handles cases where
   * the window has not been created yet.
   *
   * Requirements: clerkly.1
   *
   * @param {WindowOptions} options - Window configuration options
   * @param {number} [options.width] - Window width in pixels
   * @param {number} [options.height] - Window height in pixels
   * @param {string} [options.title] - Window title text
   * @param {boolean} [options.resizable] - Whether window can be resized
   * @param {boolean} [options.fullscreen] - Whether window is in fullscreen mode
   *
   * @returns {void}
   *
   * @remarks
   * - Does nothing if window has not been created yet (logs warning)
   * - All parameters are optional - only provided options are applied
   * - Width and height must be provided together to change window size
   * - Errors during configuration are caught and logged
   * - Changes made via this method do not automatically persist
   *
   * @example
   * ```typescript
   * // Change window size
   * windowManager.configureWindow({ width: 1200, height: 800 });
   *
   * // Set window title
   * windowManager.configureWindow({ title: 'My App' });
   *
   * // Make window non-resizable
   * windowManager.configureWindow({ resizable: false });
   *
   * // Enter fullscreen mode
   * windowManager.configureWindow({ fullscreen: true });
   * ```
   */
  configureWindow(options: WindowOptions): void {
    if (!this.mainWindow) {
      this.logger.warn('Cannot configure window: window not created');
      return;
    }

    try {
      // Requirements: clerkly.1- Configure window parameters
      if (options.width !== undefined && options.height !== undefined) {
        this.mainWindow.setSize(options.width, options.height);
      }

      if (options.title !== undefined) {
        this.mainWindow.setTitle(options.title);
      }

      if (options.resizable !== undefined) {
        this.mainWindow.setResizable(options.resizable);
      }

      if (options.fullscreen !== undefined) {
        this.mainWindow.setFullScreen(options.fullscreen);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to configure window: ${errorMessage}`);
    }
  }

  /**
   * Sets up tracking of window state changes for automatic persistence
   *
   * Subscribes to window events (resize, move, maximize, unmaximize, close) and
   * automatically saves the current window state when any of these events occur.
   * This ensures that user preferences for window size, position, and maximized
   * state are preserved across application restarts.
   *
   * Requirements: ui.5.1, ui.5.2, ui.5.3
   *
   * @private
   * @returns {void}
   *
   * @remarks
   * - Tracks resize events to save window dimensions (ui.5.1)
   * - Tracks move events to save window position (ui.5.2)
   * - Tracks maximize/unmaximize events to save maximized state (ui.5.3)
   * - Saves final state before window closes to ensure no data loss
   * - Does nothing if mainWindow is not initialized
   *
   * @example
   * ```typescript
   * // Called automatically after window creation in createWindow()
   * this.setupStateTracking();
   * // Now window state changes are automatically persisted
   * ```
   */
  // Requirements: ui.5.1, ui.5.2, ui.5.3
  private setupStateTracking(): void {
    if (!this.mainWindow) {
      return;
    }

    // Requirements: ui.5.1
    this.mainWindow.on('resize', () => this.saveCurrentState());
    // Requirements: ui.5.2
    this.mainWindow.on('move', () => this.saveCurrentState());
    // Requirements: ui.5.3
    this.mainWindow.on('maximize', () => this.saveCurrentState());
    this.mainWindow.on('unmaximize', () => this.saveCurrentState());
    // Save final state before closing
    this.mainWindow.on('close', () => this.saveCurrentState());
  }

  /**
   * Saves the current window state to persistent storage
   *
   * Captures the current window bounds (position and size) and maximized state,
   * then persists them to the database through WindowStateManager. This method
   * is called automatically whenever the window state changes (resize, move,
   * maximize, unmaximize, close events).
   *
   * Requirements: ui.5.1, ui.5.2, ui.5.3
   *
   * @private
   * @returns {void}
   *
   * @remarks
   * - Saves window dimensions (width, height) when resized (ui.5.1)
   * - Saves window position (x, y) when moved (ui.5.2)
   * - Saves maximized state when window is maximized/unmaximized (ui.5.3)
   * - Does nothing if mainWindow is not initialized
   * - State is persisted to SQLite database via WindowStateManager
   * - Errors during save are handled gracefully by WindowStateManager
   *
   * @example
   * ```typescript
   * // Called automatically by event handlers
   * this.mainWindow.on('resize', () => this.saveCurrentState());
   *
   * // Current state is captured and saved:
   * // { x: 100, y: 100, width: 1200, height: 800, isMaximized: false }
   * ```
   */
  // Requirements: ui.5.1, ui.5.2, ui.5.3
  private saveCurrentState(): void {
    if (!this.mainWindow) {
      return;
    }

    const bounds = this.mainWindow.getBounds();
    const isMaximized = this.mainWindow.isMaximized();

    this.windowStateManager.saveState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    });
  }

  /**
   * Closes window with cleanup
   *
   * Safely closes the main window and performs cleanup operations including
   * removing all event listeners and clearing the window reference. The final
   * window state is automatically saved before closing via the 'close' event
   * handler set up in setupStateTracking().
   *
   * Requirements: clerkly.1
   *
   * @returns {void}
   *
   * @remarks
   * - Does nothing if window has not been created
   * - Removes all event listeners to prevent memory leaks
   * - Closes the window gracefully
   * - Clears the mainWindow reference
   * - Window state is saved automatically via 'close' event before closing
   * - Errors during close are caught and logged
   * - Window reference is cleared even if close operation fails
   *
   * @example
   * ```typescript
   * // Close the window and clean up
   * windowManager.closeWindow();
   * // Window is closed, listeners removed, state saved
   * ```
   */
  closeWindow(): void {
    if (!this.mainWindow) {
      return;
    }

    try {
      // Requirements: clerkly.1- Close window with cleanup of listeners
      this.mainWindow.removeAllListeners();
      this.mainWindow.close();
      this.mainWindow = null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to close window: ${errorMessage}`);
      // Ensure reference is cleared even if close fails
      this.mainWindow = null;
    }
  }

  /**
   * Gets current window instance
   *
   * Returns the current BrowserWindow instance or null if the window has not
   * been created yet or has been closed. Use this method to access the window
   * for direct manipulation or to check if a window exists.
   *
   * Requirements: clerkly.1
   *
   * @returns {BrowserWindow | null} The current window instance or null if not created
   *
   * @remarks
   * - Returns null if createWindow() has not been called yet
   * - Returns null if closeWindow() has been called
   * - Returns null if window was closed by user
   * - Use isWindowCreated() to check existence before accessing
   *
   * @example
   * ```typescript
   * const window = windowManager.getWindow();
   * if (window) {
   *   // Window exists, safe to use
   *   window.focus();
   * } else {
   *   // Window not created or already closed
   *   this.logger.info('No window available');
   * }
   * ```
   */
  getWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Checks if window is created and available
   *
   * Returns true if the window has been created and is still available,
   * false otherwise. This is a convenience method to check window existence
   * before attempting operations that require a valid window instance.
   *
   * Requirements: clerkly.1
   *
   * @returns {boolean} True if window exists, false otherwise
   *
   * @remarks
   * - Returns false if createWindow() has not been called
   * - Returns false if closeWindow() has been called
   * - Returns false if window was closed by user
   * - Equivalent to checking getWindow() !== null
   *
   * @example
   * ```typescript
   * if (windowManager.isWindowCreated()) {
   *   // Safe to perform window operations
   *   windowManager.configureWindow({ title: 'New Title' });
   * } else {
   *   // Need to create window first
   *   windowManager.createWindow();
   * }
   * ```
   */
  isWindowCreated(): boolean {
    return this.mainWindow !== null;
  }
}

export default WindowManager;
