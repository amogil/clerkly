// Requirements: ui.5

import { screen } from 'electron';
import { DataManager } from './DataManager';

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
 * Manages window state persistence using DataManager.
 *
 * This class is responsible for saving and loading the application window's state
 * (position, size, and maximized status) to/from persistent storage. It ensures
 * that the window opens in the same state as when it was last closed, and handles
 * edge cases such as invalid positions (e.g., when a monitor is disconnected).
 *
 * Requirements: ui.5
 *
 * @example
 * ```typescript
 * // Create a WindowStateManager instance
 * const dataManager = new DataManager();
 * const stateManager = new WindowStateManager(dataManager);
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
  private dataManager: DataManager;
  private readonly stateKey = 'window_state';

  /**
   * Creates a new WindowStateManager instance.
   *
   * Requirements: ui.5
   *
   * @param dataManager - DataManager instance for state persistence. This is used
   *                      to save and load window state from the SQLite database.
   *
   * @example
   * ```typescript
   * const dataManager = new DataManager();
   * const stateManager = new WindowStateManager(dataManager);
   * ```
   */
  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * Loads window state from persistent storage.
   *
   * This method attempts to load the previously saved window state from the database.
   * If no saved state exists (first launch), or if the saved position is invalid
   * (e.g., monitor was disconnected), it returns a default state based on the
   * primary display's size.
   *
   * Requirements: ui.5.4, ui.5.5, ui.5.6
   *
   * @returns WindowState object containing the window's position, size, and maximized status.
   *          Returns default state if:
   *          - No saved state exists (first launch) - ui.5.5
   *          - Saved state is corrupted or invalid
   *          - Saved position is outside available display bounds - ui.5.6
   *
   * @example
   * ```typescript
   * const stateManager = new WindowStateManager(dataManager);
   *
   * // Load state (returns saved state or default on first launch)
   * const state = stateManager.loadState();
   * console.log(state);
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
      // Requirements: ui.5.4
      const result = this.dataManager.loadData(this.stateKey);

      if (result.success && result.data) {
        const state = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;

        // Requirements: ui.5.6
        if (this.isPositionValid(state.x, state.y)) {
          return state;
        }
      }
    } catch (error) {
      console.error('Failed to load window state:', error);
    }

    // Requirements: ui.5.5
    return this.getDefaultState();
  }

  /**
   * Saves window state to persistent storage.
   *
   * This method serializes the window state to JSON and saves it to the database
   * using DataManager. The state includes the window's position (x, y), size
   * (width, height), and maximized status. This method should be called whenever
   * the window state changes (resize, move, maximize, unmaximize events).
   *
   * If saving fails (e.g., database error, disk full), the error is logged but
   * not thrown, ensuring the application continues to function normally.
   *
   * Requirements: ui.5.1, ui.5.2, ui.5.3
   *
   * @param state - WindowState object to save. Must contain valid x, y, width,
   *                height, and isMaximized properties.
   *
   * @example
   * ```typescript
   * const stateManager = new WindowStateManager(dataManager);
   * const window = new BrowserWindow({ width: 800, height: 600 });
   *
   * // Save state when window is resized (ui.5.1)
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
   * // Save state when window is moved (ui.5.2)
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
   * // Save state when window is maximized/unmaximized (ui.5.3)
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
      const stateJson = JSON.stringify(state);
      this.dataManager.saveData(this.stateKey, stateJson);
    } catch (error) {
      console.error('Failed to save window state:', error);
    }
  }

  /**
   * Gets the default window state based on primary display size.
   *
   * This private method calculates the default window state when no saved state
   * exists or when the saved state is invalid. The window size is set to fill
   * the entire work area (screen size minus system UI elements like menu bar
   * and dock), positioned at (0, 0).
   *
   * The default state has isMaximized set to false, ensuring the window
   * opens in a large size but remains resizable by the user.
   *
   * Requirements: ui.1.1, ui.1.3, ui.4.1, ui.4.2, ui.4.3
   *
   * @returns Default WindowState object with position, size, and maximized status
   *          calculated based on the primary display's dimensions.
   *
   * @example
   * ```typescript
   * // For a 1920x1080 display with workAreaSize 1920x1055 (25px menu bar):
   * // Returns: {
   * //   x: 0,
   * //   y: 0,
   * //   width: 1920,
   * //   height: 1055,
   * //   isMaximized: false
   * // }
   *
   * // For a smaller 1366x768 display with workAreaSize 1366x743:
   * // Returns: {
   * //   x: 0,
   * //   y: 0,
   * //   width: 1366,
   * //   height: 743,
   * //   isMaximized: false
   * // }
   * ```
   */
  private getDefaultState(): WindowState {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Requirements: ui.1.1, ui.1.3, ui.4.1, ui.4.2, ui.4.3
    return {
      x: 0,
      y: 0,
      width: width,
      height: height,
      isMaximized: false, // Requirements: ui.1.1, ui.1.3 - large window but not maximized, so it's resizable
    };
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
   * Requirements: ui.5.6
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
