// Requirements: ui.5

import { WindowStateManager, WindowState } from '../../src/main/WindowStateManager';
import { DataManager } from '../../src/main/DataManager';

// Mock electron module
jest.mock('electron', () => ({
  screen: {
    getPrimaryDisplay: jest.fn(),
    getAllDisplays: jest.fn(),
  },
}));

describe('WindowStateManager', () => {
  let windowStateManager: WindowStateManager;
  let mockDataManager: jest.Mocked<DataManager>;
  let mockScreen: any;

  beforeEach(() => {
    // Create mock DataManager
    mockDataManager = {
      loadData: jest.fn(),
      saveData: jest.fn(),
    } as any;

    // Get mocked electron screen
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mockScreen = require('electron').screen;

    // Setup default screen mock
    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    });

    mockScreen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    // Create WindowStateManager instance
    windowStateManager = new WindowStateManager(mockDataManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('loadState', () => {
    /* Preconditions: no saved state in database
       Action: call loadState()
       Assertions: returns default state with isMaximized: true, dimensions based on screen size
       Requirements: ui.4.1, ui.5.5 */
    it('should return default state when no saved state exists', () => {
      mockDataManager.loadData.mockReturnValue({ success: false });

      const result = windowStateManager.loadState();

      expect(result).toBeDefined();
      expect(result.isMaximized).toBe(true);
      expect(result.width).toBe(Math.floor(1920 * 0.9));
      expect(result.height).toBe(Math.floor(1080 * 0.9));
      expect(result.x).toBe(Math.floor(1920 * 0.05));
      expect(result.y).toBe(Math.floor(1080 * 0.05));
    });

    /* Preconditions: valid state saved in database
       Action: call loadState()
       Assertions: returns saved state
       Requirements: ui.5.4 */
    it('should load saved state from database', () => {
      const savedState: WindowState = {
        x: 100,
        y: 100,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      mockDataManager.loadData.mockReturnValue({
        success: true,
        data: savedState,
      });

      const result = windowStateManager.loadState();

      expect(result).toEqual(savedState);
      expect(mockDataManager.loadData).toHaveBeenCalledWith('window_state');
    });

    /* Preconditions: saved state with position outside screen bounds
       Action: call loadState()
       Assertions: returns default state on primary screen
       Requirements: ui.5.6 */
    it('should return default state for invalid position', () => {
      const invalidState: WindowState = {
        x: 5000, // Outside screen bounds
        y: 5000,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      mockDataManager.loadData.mockReturnValue({
        success: true,
        data: invalidState,
      });

      const result = windowStateManager.loadState();

      // Should return default state instead
      expect(result.isMaximized).toBe(true);
      expect(result.x).toBe(Math.floor(1920 * 0.05));
      expect(result.y).toBe(Math.floor(1080 * 0.05));
    });

    /* Preconditions: corrupted JSON in database
       Action: call loadState()
       Assertions: returns default state, error logged
       Requirements: ui.5 */
    it('should handle corrupted state data', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDataManager.loadData.mockReturnValue({
        success: true,
        data: 'invalid json {[',
      });

      const result = windowStateManager.loadState();

      expect(result.isMaximized).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to load window state:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: DataManager.loadData throws error
       Action: call loadState()
       Assertions: returns default state, error logged
       Requirements: ui.5 */
    it('should handle database read errors', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDataManager.loadData.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = windowStateManager.loadState();

      expect(result.isMaximized).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to load window state:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: saved state with position on secondary display
       Action: call loadState()
       Assertions: returns saved state (position is valid)
       Requirements: ui.5.4, ui.5.6 */
    it('should accept position on secondary display', () => {
      const savedState: WindowState = {
        x: 2000, // On secondary display
        y: 100,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      mockDataManager.loadData.mockReturnValue({
        success: true,
        data: savedState,
      });

      // Mock two displays
      mockScreen.getAllDisplays.mockReturnValue([
        { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }, // Secondary display
      ]);

      const result = windowStateManager.loadState();

      expect(result).toEqual(savedState);
    });

    /* Preconditions: saved state with position at edge of display
       Action: call loadState()
       Assertions: returns saved state (boundary test)
       Requirements: ui.5.4, ui.5.6 */
    it('should accept position at display edge', () => {
      const savedState: WindowState = {
        x: 1919, // At right edge of display
        y: 1079, // At bottom edge of display
        width: 800,
        height: 600,
        isMaximized: false,
      };

      mockDataManager.loadData.mockReturnValue({
        success: true,
        data: savedState,
      });

      const result = windowStateManager.loadState();

      expect(result).toEqual(savedState);
    });

    /* Preconditions: saved state with negative position (multi-monitor setup)
       Action: call loadState()
       Assertions: returns saved state if position is valid on any display
       Requirements: ui.5.4, ui.5.6 */
    it('should accept negative position on valid display', () => {
      const savedState: WindowState = {
        x: -1000, // On display to the left
        y: 100,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      mockDataManager.loadData.mockReturnValue({
        success: true,
        data: savedState,
      });

      // Mock display to the left of primary
      mockScreen.getAllDisplays.mockReturnValue([
        { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { bounds: { x: -1920, y: 0, width: 1920, height: 1080 } }, // Display to the left
      ]);

      const result = windowStateManager.loadState();

      expect(result).toEqual(savedState);
    });
  });

  describe('getDefaultState', () => {
    /* Preconditions: screen size is 1920x1080
       Action: call getDefaultState()
       Assertions: returns state with 90% of screen size, 5% offset, maximized
       Requirements: ui.1.1, ui.4.1, ui.4.2, ui.4.3 */
    it('should generate default state based on screen size', () => {
      mockScreen.getPrimaryDisplay.mockReturnValue({
        workAreaSize: { width: 1920, height: 1080 },
      });

      const result = (windowStateManager as any).getDefaultState();

      expect(result.width).toBe(Math.floor(1920 * 0.9));
      expect(result.height).toBe(Math.floor(1080 * 0.9));
      expect(result.x).toBe(Math.floor(1920 * 0.05));
      expect(result.y).toBe(Math.floor(1080 * 0.05));
      expect(result.isMaximized).toBe(true);
    });

    /* Preconditions: small screen size (1366x768)
       Action: call getDefaultState()
       Assertions: returns state adapted to small screen
       Requirements: ui.4.1, ui.4.4 */
    it('should adapt to small screen size', () => {
      mockScreen.getPrimaryDisplay.mockReturnValue({
        workAreaSize: { width: 1366, height: 768 },
      });

      const result = (windowStateManager as any).getDefaultState();

      expect(result.width).toBe(Math.floor(1366 * 0.9));
      expect(result.height).toBe(Math.floor(768 * 0.9));
      expect(result.x).toBe(Math.floor(1366 * 0.05));
      expect(result.y).toBe(Math.floor(768 * 0.05));
      expect(result.isMaximized).toBe(true);
    });

    /* Preconditions: large screen size (3840x2160)
       Action: call getDefaultState()
       Assertions: returns state adapted to large screen
       Requirements: ui.4.1, ui.4.2 */
    it('should adapt to large screen size', () => {
      mockScreen.getPrimaryDisplay.mockReturnValue({
        workAreaSize: { width: 3840, height: 2160 },
      });

      const result = (windowStateManager as any).getDefaultState();

      expect(result.width).toBe(Math.floor(3840 * 0.9));
      expect(result.height).toBe(Math.floor(2160 * 0.9));
      expect(result.x).toBe(Math.floor(3840 * 0.05));
      expect(result.y).toBe(Math.floor(2160 * 0.05));
      expect(result.isMaximized).toBe(true);
    });

    /* Preconditions: various screen sizes
       Action: call getDefaultState() with different screen sizes
       Assertions: dimensions are never hardcoded to 1920x1080
       Requirements: ui.4.3 */
    it('should not use hardcoded dimensions', () => {
      const screenSizes = [
        { width: 1366, height: 768 },
        { width: 1920, height: 1080 },
        { width: 2560, height: 1440 },
        { width: 3840, height: 2160 },
      ];

      screenSizes.forEach((size) => {
        mockScreen.getPrimaryDisplay.mockReturnValue({
          workAreaSize: size,
        });

        const result = (windowStateManager as any).getDefaultState();

        // Verify dimensions are based on screen size, not hardcoded
        expect(result.width).toBe(Math.floor(size.width * 0.9));
        expect(result.height).toBe(Math.floor(size.height * 0.9));
      });
    });
  });

  describe('isPositionValid', () => {
    /* Preconditions: position is within primary display bounds
       Action: call isPositionValid() with valid position
       Assertions: returns true
       Requirements: ui.5.6 */
    it('should return true for position within display bounds', () => {
      mockScreen.getAllDisplays.mockReturnValue([
        { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      ]);

      const result = (windowStateManager as any).isPositionValid(100, 100);

      expect(result).toBe(true);
    });

    /* Preconditions: position is outside all display bounds
       Action: call isPositionValid() with invalid position
       Assertions: returns false
       Requirements: ui.5.6 */
    it('should return false for position outside display bounds', () => {
      mockScreen.getAllDisplays.mockReturnValue([
        { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      ]);

      const result = (windowStateManager as any).isPositionValid(5000, 5000);

      expect(result).toBe(false);
    });

    /* Preconditions: position is on secondary display
       Action: call isPositionValid() with position on secondary display
       Assertions: returns true
       Requirements: ui.5.6 */
    it('should return true for position on secondary display', () => {
      mockScreen.getAllDisplays.mockReturnValue([
        { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
      ]);

      const result = (windowStateManager as any).isPositionValid(2000, 100);

      expect(result).toBe(true);
    });

    /* Preconditions: position is at display edge (boundary test)
       Action: call isPositionValid() with position at edge
       Assertions: returns true
       Requirements: ui.5.6 */
    it('should return true for position at display edge', () => {
      mockScreen.getAllDisplays.mockReturnValue([
        { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      ]);

      const result = (windowStateManager as any).isPositionValid(1919, 1079);

      expect(result).toBe(true);
    });

    /* Preconditions: position is exactly at display boundary
       Action: call isPositionValid() with position at boundary
       Assertions: returns false (boundary is exclusive)
       Requirements: ui.5.6 */
    it('should return false for position at display boundary', () => {
      mockScreen.getAllDisplays.mockReturnValue([
        { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      ]);

      const result = (windowStateManager as any).isPositionValid(1920, 1080);

      expect(result).toBe(false);
    });

    /* Preconditions: negative position on display to the left
       Action: call isPositionValid() with negative position
       Assertions: returns true if display exists at that position
       Requirements: ui.5.6 */
    it('should handle negative positions correctly', () => {
      mockScreen.getAllDisplays.mockReturnValue([
        { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { bounds: { x: -1920, y: 0, width: 1920, height: 1080 } },
      ]);

      const result = (windowStateManager as any).isPositionValid(-1000, 100);

      expect(result).toBe(true);
    });

    /* Preconditions: no displays available (edge case)
       Action: call isPositionValid() with empty display list
       Assertions: returns false
       Requirements: ui.5.6 */
    it('should return false when no displays available', () => {
      mockScreen.getAllDisplays.mockReturnValue([]);

      const result = (windowStateManager as any).isPositionValid(100, 100);

      expect(result).toBe(false);
    });
  });

  describe('saveState', () => {
    /* Preconditions: valid window state
       Action: call saveState()
       Assertions: state saved to database as JSON
       Requirements: ui.5.1, ui.5.2, ui.5.3 */
    it('should save state to database', () => {
      const state: WindowState = {
        x: 100,
        y: 100,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      windowStateManager.saveState(state);

      expect(mockDataManager.saveData).toHaveBeenCalledWith('window_state', JSON.stringify(state));
    });

    /* Preconditions: database write fails
       Action: call saveState()
       Assertions: error logged, no exception thrown
       Requirements: ui.5 */
    it('should handle save errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDataManager.saveData.mockImplementation(() => {
        throw new Error('Database write error');
      });

      const state: WindowState = {
        x: 100,
        y: 100,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      // Should not throw
      expect(() => windowStateManager.saveState(state)).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to save window state:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: state with maximized flag
       Action: call saveState() with isMaximized: true
       Assertions: maximized state saved correctly
       Requirements: ui.5.3 */
    it('should save maximized state correctly', () => {
      const state: WindowState = {
        x: 100,
        y: 100,
        width: 800,
        height: 600,
        isMaximized: true,
      };

      windowStateManager.saveState(state);

      const savedData = mockDataManager.saveData.mock.calls[0][1];
      const parsedState = JSON.parse(savedData as string);

      expect(parsedState.isMaximized).toBe(true);
    });

    /* Preconditions: state with various dimensions
       Action: call saveState() with different dimensions
       Assertions: all dimensions saved correctly
       Requirements: ui.5.1, ui.5.2 */
    it('should save all state properties correctly', () => {
      const state: WindowState = {
        x: 250,
        y: 150,
        width: 1200,
        height: 900,
        isMaximized: false,
      };

      windowStateManager.saveState(state);

      const savedData = mockDataManager.saveData.mock.calls[0][1];
      const parsedState = JSON.parse(savedData as string);

      expect(parsedState).toEqual(state);
    });

    /* Preconditions: state with negative coordinates (multi-monitor)
       Action: call saveState() with negative coordinates
       Assertions: negative coordinates saved correctly
       Requirements: ui.5.2 */
    it('should save negative coordinates correctly', () => {
      const state: WindowState = {
        x: -1000,
        y: -500,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      windowStateManager.saveState(state);

      const savedData = mockDataManager.saveData.mock.calls[0][1];
      const parsedState = JSON.parse(savedData as string);

      expect(parsedState.x).toBe(-1000);
      expect(parsedState.y).toBe(-500);
    });

    /* Preconditions: state with large dimensions
       Action: call saveState() with large dimensions
       Assertions: large dimensions saved correctly
       Requirements: ui.5.1 */
    it('should save large dimensions correctly', () => {
      const state: WindowState = {
        x: 0,
        y: 0,
        width: 3840,
        height: 2160,
        isMaximized: false,
      };

      windowStateManager.saveState(state);

      const savedData = mockDataManager.saveData.mock.calls[0][1];
      const parsedState = JSON.parse(savedData as string);

      expect(parsedState.width).toBe(3840);
      expect(parsedState.height).toBe(2160);
    });
  });
});
