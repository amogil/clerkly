// Requirements: window-management.5, database-refactoring.3.6, user-data-isolation.6.8

import { screen } from 'electron';
import type { IDatabaseManager } from './DatabaseManager';
import { Logger } from './Logger';

const DEFAULT_WINDOW_WIDTH = 900;
const DEFAULT_WINDOW_HEIGHT = 700;
const MIN_WINDOW_WIDTH = 350;
const MIN_WINDOW_HEIGHT = 650;

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Represents the state of the application window
 */
export interface WindowState {
  /**
   * X coordinate of the top-left corner of the window
   */
  x: number;

  /**
   * Y coordinate of the top-left corner of the window
   */
  y: number;

  /**
   * Width of the window in pixels
   */
  width: number;

  /**
   * Height of the window in pixels
   */
  height: number;

  /**
   * Flag indicating whether the window is in maximized state
   */
  isMaximized: boolean;
}

/**
 * Manages window state persistence using DatabaseManager global repository.
 *
 * This class is responsible for saving and loading the application window's state
 * (position, size, and maximized status) to/from persistent storage. It ensures
 * that the window opens in the same state as when it was last closed, and handles
 * edge cases such as invalid positions (e.g., when a monitor is disconnected).
 *
 * Requirements: window-management.5, user-data-isolation.6.8
 * Note: WindowStateManager uses dbManager.global.windowState repository
 * because window state is global (not user-specific).
 *
 * @example
 * ```typescript
 * // Create a WindowStateManager instance
 * const dbManager = new DatabaseManager();
 * const stateManager = new WindowStateManager(dbManager);
 *
 * // Load saved state (or get default state on first launch)
 * const state = stateManager.loadState();
 *
 * // Create window with loaded state
 * const window = new BrowserWindow({
 *   x: state.x,
 *   y: state.y,
 *   width: state.width,
 *   height: state.height
 * });
 *
 * if (state.isMaximized) {
 *   window.maximize();
 * }
 *
 * // Save state when window changes
 * window.on('resize', () => {
 *   const bounds = window.getBounds();
 *   stateManager.saveState({
 *     x: bounds.x,
 *     y: bounds.y,
 *     width: bounds.width,
 *     height: bounds.height,
 *     isMaximized: window.isMaximized()
 *   });
 * });
 * ```
 */
export class WindowStateManager {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('WindowStateManager');
  private dbManager: IDatabaseManager;

  /**
   * Creates a new WindowStateManager instance.
   *
   * Requirements: window-management.5, user-data-isolation.6.8
   *
   * @param dbManager - DatabaseManager instance for database access.
   *
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * const stateManager = new WindowStateManager(dbManager);
   * ```
   */
  constructor(dbManager: IDatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Loads window state from persistent storage using global repository.
   *
   * This method attempts to load the previously saved window state from the database.
   * If no saved state exists (first launch), or if the saved position is invalid
   * (e.g., monitor was disconnected), it returns a default state based on the
   * primary display's size.
   *
   * Requirements: window-management.5.4, window-management.5.5, window-management.5.6, user-data-isolation.6.8
   *
   * @returns WindowState object containing the window's position, size, and maximized status.
   *          Returns default state if:
   *          - No saved state exists (first launch) - window-management.5.5
   *          - Saved state is corrupted or invalid
   *          - Saved position is outside available display bounds - window-management.5.6
   *
   * @example
   * ```typescript
   * const stateManager = new WindowStateManager(dbManager);
   *
   * // Load state (returns saved state or default on first launch)
   * const state = stateManager.loadState();
   * logger.info(state);
   * // Output: { x: 100, y: 100, width: 1200, height: 800, isMaximized: false }
   *
   * // Use state to create window
   * const window = new BrowserWindow({
   *   x: state.x,
   *   y: state.y,
   *   width: state.width,
   *   height: state.height
   * });
   * ```
   */
  loadState(): WindowState {
    try {
      // Requirements: user-data-isolation.6.8 - Use dbManager.global.windowState
      const state = this.dbManager.global.windowState.get();

      if (state) {
        // Requirements: window-management.5.6
        if (this.isPositionValid(state.x, state.y)) {
          return this.normalizeStateSize(state);
        }
      }
    } catch (error) {
      // Requirements: error-notifications.1.4 - Log error
      this.logger.error(`Failed to load window state: ${error}`);
      // Note: Not using handleBackgroundError here as window state loading failure
      // is not critical - we fall back to default state gracefully
    }

    // Requirements: window-management.5.5
    return this.getDefaultState();
  }

  /**
   * Saves window state to persistent storage using global repository.
   *
   * This method saves the window state to the database using the global repository.
   * The state includes the window's position (x, y), size (width, height), and
   * maximized status. This method should be called whenever the window state
   * changes (resize, move, maximize, unmaximize events).
   *
   * If saving fails (e.g., database error, disk full), the error is logged but
   * not thrown, ensuring the application continues to function normally.
   *
   * Requirements: window-management.5.1, window-management.5.2, window-management.5.3, user-data-isolation.6.8
   *
   * @param state - WindowState object to save. Must contain valid x, y, width,
   *                height, and isMaximized properties.
   *
   * @example
   * ```typescript
   * const stateManager = new WindowStateManager(dbManager);
   * const window = new BrowserWindow({ width: 900, height: 700 });
   *
   * // Save state when window is resized (window-management.5.1)
   * window.on('resize', () => {
   *   const bounds = window.getBounds();
   *   stateManager.saveState({
   *     x: bounds.x,
   *     y: bounds.y,
   *     width: bounds.width,
   *     height: bounds.height,
   *     isMaximized: window.isMaximized()
   *   });
   * });
   *
   * // Save state when window is moved (window-management.5.2)
   * window.on('move', () => {
   *   const bounds = window.getBounds();
   *   stateManager.saveState({
   *     x: bounds.x,
   *     y: bounds.y,
   *     width: bounds.width,
   *     height: bounds.height,
   *     isMaximized: window.isMaximized()
   *   });
   * });
   *
   * // Save state when window is maximized/unmaximized (window-management.5.3)
   * window.on('maximize', () => {
   *   const bounds = window.getBounds();
   *   stateManager.saveState({
   *     x: bounds.x,
   *     y: bounds.y,
   *     width: bounds.width,
   *     height: bounds.height,
   *     isMaximized: true
   *   });
   * });
   * ```
   */
  saveState(state: WindowState): void {
    try {
      // Requirements: user-data-isolation.6.8 - Use dbManager.global.windowState
      this.dbManager.global.windowState.set(state);
    } catch (error) {
      // Requirements: error-notifications.1.4 - Log error
      this.logger.error(`Failed to save window state: ${error}`);
      // Note: Not using handleBackgroundError here as window state saving failure
      // is not critical - user can continue working normally
    }
  }

  /**
   * Gets the default window state based on primary display size.
   *
   * This private method calculates the default window state when no saved state
   * exists or when the saved state is invalid. The window opens with a compact
   * size of min(900, screenWidth) x min(700, screenHeight), centered on the screen.
   * This provides a focused interface for agent chats while allowing immediate resizing.
   *
   * The default state has isMaximized set to false, ensuring the window
   * opens in a compact size but remains resizable by the user.
   *
   * Requirements: window-management.1.1, window-management.1.3, window-management.1.6, window-management.4.1, window-management.4.2, window-management.4.4
   *
   * @returns Default WindowState object with position, size, and maximized status
   *          calculated based on the primary display's dimensions.
   *
   * @example
   * ```typescript
   * // For a 1920x1080 display with workAreaSize 1920x1055 (25px menu bar):
   * // Returns: {
   * //   x: 510,
   * //   y: 177,
   * //   width: 900,
   * //   height: 700,
   * //   isMaximized: false
   * // }
   *
   * // For a smaller 1366x768 display with workAreaSize 1366x743:
   * // Returns: {
   * //   x: 233,
   * //   y: 21,
   * //   width: 900,
   * //   height: 700,
   * //   isMaximized: false
   * // }
   *
   * // For a very small 800x600 display:
   * // Returns: {
   * //   x: 0,
   * //   y: 0,
   * //   width: 800,
   * //   height: 600,
   * //   isMaximized: false
   * // }
   * ```
   */
  private getDefaultState(): WindowState {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Requirements: window-management.1.1, window-management.1.6, window-management.4.2, window-management.4.4
    // Window opens with size min(900, screenWidth) x min(700, screenHeight) on first launch,
    // but is never allowed to be smaller than 350x650.
    // This provides a focused interface for agent chats while allowing immediate resizing
    const desiredWidth = Math.min(DEFAULT_WINDOW_WIDTH, screenWidth);
    const desiredHeight = Math.min(DEFAULT_WINDOW_HEIGHT, screenHeight);
    const width = this.clampDimension(desiredWidth, MIN_WINDOW_WIDTH, screenWidth);
    const height = this.clampDimension(desiredHeight, MIN_WINDOW_HEIGHT, screenHeight);

    // Requirements: window-management.4.4 - Center window on screen
    const x = Math.floor((screenWidth - width) / 2);
    const y = Math.floor((screenHeight - height) / 2);

    // Requirements: window-management.1.1, window-management.1.3 - NOT maximized, window is resizable from the start
    return {
      x: x,
      y: y,
      width: width,
      height: height,
      isMaximized: false,
    };
  }

  // Requirements: window-management.1.6
  private normalizeStateSize(state: WindowState): WindowState {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    return {
      ...state,
      width: this.clampDimension(state.width, MIN_WINDOW_WIDTH, screenWidth),
      height: this.clampDimension(state.height, MIN_WINDOW_HEIGHT, screenHeight),
    };
  }

  // Requirements: window-management.1.6
  private clampDimension(value: number, min: number, max: number): number {
    if (max < min) {
      return max;
    }

    return Math.max(min, Math.min(value, max));
  }

  /**
   * Validates if the given position is within available display bounds.
   *
   * This private method checks whether a window position (x, y coordinates) falls
   * within the bounds of any currently connected display. This is crucial for
   * handling scenarios where a user disconnects an external monitor - without this
   * validation, the window could open on a non-existent display and be invisible.
   *
   * The method iterates through all available displays and checks if the given
   * position falls within any of their bounds.
   *
   * Requirements: window-management.5.6
   *
   * @param x - X coordinate to validate (horizontal position in pixels)
   * @param y - Y coordinate to validate (vertical position in pixels)
   *
   * @returns true if the position is within any available display's bounds,
   *          false if the position is outside all displays (e.g., monitor was disconnected)
   *
   * @example
   * ```typescript
   * // Scenario 1: Valid position on primary display (1920x1080)
   * const isValid1 = stateManager.isPositionValid(100, 100);
   * // Returns: true (position is within display bounds)
   *
   * // Scenario 2: Position on disconnected external monitor
   * const isValid2 = stateManager.isPositionValid(3000, 100);
   * // Returns: false (no display at that position)
   *
   * // Scenario 3: Multi-monitor setup
   * // Primary: 0,0 to 1920,1080
   * // Secondary: 1920,0 to 3840,1080
   * const isValid3 = stateManager.isPositionValid(2000, 100);
   * // Returns: true (position is on secondary display)
   * ```
   */
  private isPositionValid(x: number, y: number): boolean {
    const displays = screen.getAllDisplays();

    return displays.some((display: Electron.Display) => {
      const { x: dx, y: dy, width, height } = display.bounds;
      return x >= dx && x < dx + width && y >= dy && y < dy + height;
    });
  }
}
