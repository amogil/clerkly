// Requirements: window-management.5, database-refactoring.3.6, user-data-isolation.6.10

import { WindowStateManager, WindowState } from '../../src/main/WindowStateManager';
import type { IDatabaseManager } from '../../src/main/DatabaseManager';

// Mock electron module
jest.mock('electron', () => ({
  screen: {
    getPrimaryDisplay: jest.fn(),
    getAllDisplays: jest.fn(),
  },
}));

describe('WindowStateManager', () => {
  let windowStateManager: WindowStateManager;
  let mockDbManager: jest.Mocked<IDatabaseManager>;
  let mockScreen: any;

  beforeEach(() => {
    // Create mock DatabaseManager with global query methods
    // Requirements: user-data-isolation.6.10 - WindowStateManager uses global methods
    mockDbManager = {
      getDatabase: jest.fn(),
      getCurrentUserId: jest.fn().mockReturnValue('test@example.com'),
      setUserManager: jest.fn(),
      // Global query methods (used by WindowStateManager)
      runQuery: jest.fn(),
      getRow: jest.fn(),
      getRows: jest.fn(),
      // User query methods (not used by WindowStateManager)
      runUserQuery: jest.fn(),
      getUserRow: jest.fn(),
      getUserRows: jest.fn(),
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
    windowStateManager = new WindowStateManager(mockDbManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('loadState', () => {
    /* Preconditions: no saved state in database
       Action: call loadState()
       Assertions: returns default state with isMaximized: false, dimensions min(600, screenWidth) x min(400, screenHeight), centered
       Requirements: window-management.1.1, window-management.4.1, window-management.4.2, window-management.4.4, window-management.5.5, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should return default state when no saved state exists', () => {
      mockDbManager.getRow.mockReturnValue(undefined);

      const result = windowStateManager.loadState();

      expect(result).toBeDefined();
      expect(result.isMaximized).toBe(false); // Not maximized to keep resizable
      expect(result.width).toBe(600); // Compact size: min(600, 1920)
      expect(result.height).toBe(400); // Compact size: min(400, 1080)
      expect(result.x).toBe(660); // Centered: (1920 - 600) / 2
      expect(result.y).toBe(340); // Centered: (1080 - 400) / 2

      // Verify getRow was called with correct params
      expect(mockDbManager.getRow).toHaveBeenCalledWith(
        'SELECT value FROM user_data WHERE key = ? AND user_id = ?',
        ['window_state', '__system__']
      );
    });

    /* Preconditions: valid state saved in database
       Action: call loadState()
       Assertions: returns saved state
       Requirements: window-management.5.4, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should load saved state from database', () => {
      const savedState: WindowState = {
        x: 100,
        y: 100,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      mockDbManager.getRow.mockReturnValue({ value: JSON.stringify(savedState) });

      const result = windowStateManager.loadState();

      expect(result).toEqual(savedState);
    });

    /* Preconditions: saved state with position outside screen bounds
       Action: call loadState()
       Assertions: returns default state on primary screen
       Requirements: window-management.5.6, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should return default state for invalid position', () => {
      const invalidState: WindowState = {
        x: 5000, // Outside screen bounds
        y: 5000,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      mockDbManager.getRow.mockReturnValue({ value: JSON.stringify(invalidState) });

      const result = windowStateManager.loadState();

      // Should return default state instead
      expect(result.isMaximized).toBe(false); // Not maximized to keep resizable
      expect(result.x).toBe(660); // Centered: (1920 - 600) / 2
      expect(result.y).toBe(340); // Centered: (1080 - 400) / 2
      expect(result.width).toBe(600); // Compact size: min(600, 1920)
      expect(result.height).toBe(400); // Compact size: min(400, 1080)
    });

    /* Preconditions: corrupted JSON in database
       Action: call loadState()
       Assertions: returns default state, error logged
       Requirements: window-management.5, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should handle corrupted state data', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDbManager.getRow.mockReturnValue({ value: 'invalid json {[' });

      const result = windowStateManager.loadState();

      expect(result.isMaximized).toBe(false); // Not maximized to keep resizable
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load window state:')
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: Database throws error (not initialized)
       Action: call loadState()
       Assertions: returns default state
       Requirements: window-management.5, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should handle database not initialized', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDbManager.getRow.mockImplementation(() => {
        throw new Error('Database not initialized');
      });

      const result = windowStateManager.loadState();

      expect(result.isMaximized).toBe(false); // Not maximized to keep resizable
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load window state:')
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: saved state with position on secondary display
       Action: call loadState()
       Assertions: returns saved state (position is valid)
       Requirements: window-management.5.4, window-management.5.6, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should accept position on secondary display', () => {
      const savedState: WindowState = {
        x: 2000, // On secondary display
        y: 100,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      mockDbManager.getRow.mockReturnValue({ value: JSON.stringify(savedState) });

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
       Requirements: window-management.5.4, window-management.5.6, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should accept position at display edge', () => {
      const savedState: WindowState = {
        x: 1919, // At right edge of display
        y: 1079, // At bottom edge of display
        width: 800,
        height: 600,
        isMaximized: false,
      };

      mockDbManager.getRow.mockReturnValue({ value: JSON.stringify(savedState) });

      const result = windowStateManager.loadState();

      expect(result).toEqual(savedState);
    });

    /* Preconditions: saved state with negative position (multi-monitor setup)
       Action: call loadState()
       Assertions: returns saved state if position is valid on any display
       Requirements: window-management.5.4, window-management.5.6, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should accept negative position on valid display', () => {
      const savedState: WindowState = {
        x: -1000, // On display to the left
        y: 100,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      mockDbManager.getRow.mockReturnValue({ value: JSON.stringify(savedState) });

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
       Assertions: returns state with compact size 600x400, centered, not maximized
       Requirements: window-management.1.1, window-management.1.3, window-management.4.1, window-management.4.2, window-management.4.4 */
    it('should generate default state based on screen size', () => {
      mockScreen.getPrimaryDisplay.mockReturnValue({
        workAreaSize: { width: 1920, height: 1080 },
      });

      const result = (windowStateManager as any).getDefaultState();

      expect(result.width).toBe(600); // Compact size: min(600, 1920)
      expect(result.height).toBe(400); // Compact size: min(400, 1080)
      expect(result.x).toBe(660); // Centered: (1920 - 600) / 2
      expect(result.y).toBe(340); // Centered: (1080 - 400) / 2
      expect(result.isMaximized).toBe(false); // Not maximized to keep resizable
    });

    /* Preconditions: small screen size (1366x768)
       Action: call getDefaultState()
       Assertions: returns state adapted to small screen with compact size
       Requirements: window-management.4.1, window-management.4.2, window-management.4.4 */
    it('should adapt to small screen size', () => {
      mockScreen.getPrimaryDisplay.mockReturnValue({
        workAreaSize: { width: 1366, height: 768 },
      });

      const result = (windowStateManager as any).getDefaultState();

      expect(result.width).toBe(600); // Compact size: min(600, 1366)
      expect(result.height).toBe(400); // Compact size: min(400, 768)
      expect(result.x).toBe(383); // Centered: (1366 - 600) / 2
      expect(result.y).toBe(184); // Centered: (768 - 400) / 2
      expect(result.isMaximized).toBe(false);
    });

    /* Preconditions: large screen size (3840x2160)
       Action: call getDefaultState()
       Assertions: returns state with compact size 600x400, centered (not full screen)
       Requirements: window-management.4.1, window-management.4.2, window-management.4.4 */
    it('should adapt to large screen size', () => {
      mockScreen.getPrimaryDisplay.mockReturnValue({
        workAreaSize: { width: 3840, height: 2160 },
      });

      const result = (windowStateManager as any).getDefaultState();

      expect(result.width).toBe(600); // Compact size: min(600, 3840)
      expect(result.height).toBe(400); // Compact size: min(400, 2160)
      expect(result.x).toBe(1620); // Centered: (3840 - 600) / 2
      expect(result.y).toBe(880); // Centered: (2160 - 400) / 2
      expect(result.isMaximized).toBe(false);
    });

    /* Preconditions: various screen sizes
       Action: call getDefaultState() with different screen sizes
       Assertions: dimensions adapt to screen size using min(600, width) x min(400, height)
       Requirements: window-management.4.2, window-management.4.3 */
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

        // Verify dimensions use min(600, width) x min(400, height), not hardcoded
        const expectedWidth = Math.min(600, size.width);
        const expectedHeight = Math.min(400, size.height);
        const expectedX = Math.floor((size.width - expectedWidth) / 2);
        const expectedY = Math.floor((size.height - expectedHeight) / 2);

        expect(result.width).toBe(expectedWidth);
        expect(result.height).toBe(expectedHeight);
        expect(result.x).toBe(expectedX);
        expect(result.y).toBe(expectedY);
      });
    });
  });

  describe('isPositionValid', () => {
    /* Preconditions: position is within primary display bounds
       Action: call isPositionValid() with valid position
       Assertions: returns true
       Requirements: window-management.5.6 */
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
       Requirements: window-management.5.6 */
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
       Requirements: window-management.5.6 */
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
       Requirements: window-management.5.6 */
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
       Requirements: window-management.5.6 */
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
       Requirements: window-management.5.6 */
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
       Requirements: window-management.5.6 */
    it('should return false when no displays available', () => {
      mockScreen.getAllDisplays.mockReturnValue([]);

      const result = (windowStateManager as any).isPositionValid(100, 100);

      expect(result).toBe(false);
    });
  });

  describe('saveState', () => {
    /* Preconditions: valid window state
       Action: call saveState()
       Assertions: state saved to database as JSON via runQuery
       Requirements: window-management.5.1, window-management.5.2, window-management.5.3, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should save state to database', () => {
      const state: WindowState = {
        x: 100,
        y: 100,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      windowStateManager.saveState(state);

      expect(mockDbManager.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_data'),
        [
          'window_state',
          JSON.stringify(state),
          '__system__',
          expect.any(Number),
          expect.any(Number),
        ]
      );
    });

    /* Preconditions: database write fails
       Action: call saveState()
       Assertions: error logged, no exception thrown
       Requirements: window-management.5, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should handle save errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDbManager.runQuery.mockImplementation(() => {
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
        expect.stringContaining('Failed to save window state:')
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: Database throws error (not initialized)
       Action: call saveState()
       Assertions: error logged, no exception thrown
       Requirements: window-management.5, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should handle database not initialized', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDbManager.runQuery.mockImplementation(() => {
        throw new Error('Database not initialized');
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
        expect.stringContaining('Failed to save window state:')
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: state with maximized flag
       Action: call saveState() with isMaximized: true
       Assertions: maximized state saved correctly
       Requirements: window-management.5.3, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should save maximized state correctly', () => {
      const state: WindowState = {
        x: 100,
        y: 100,
        width: 800,
        height: 600,
        isMaximized: true,
      };

      windowStateManager.saveState(state);

      const savedData = (mockDbManager.runQuery as jest.Mock).mock.calls[0][1][1];
      const parsedState = JSON.parse(savedData as string);

      expect(parsedState.isMaximized).toBe(true);
    });

    /* Preconditions: state with various dimensions
       Action: call saveState() with different dimensions
       Assertions: all dimensions saved correctly
       Requirements: window-management.5.1, window-management.5.2, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should save all state properties correctly', () => {
      const state: WindowState = {
        x: 250,
        y: 150,
        width: 1200,
        height: 900,
        isMaximized: false,
      };

      windowStateManager.saveState(state);

      const savedData = (mockDbManager.runQuery as jest.Mock).mock.calls[0][1][1];
      const parsedState = JSON.parse(savedData as string);

      expect(parsedState).toEqual(state);
    });

    /* Preconditions: state with negative coordinates (multi-monitor)
       Action: call saveState() with negative coordinates
       Assertions: negative coordinates saved correctly
       Requirements: window-management.5.2, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should save negative coordinates correctly', () => {
      const state: WindowState = {
        x: -1000,
        y: -500,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      windowStateManager.saveState(state);

      const savedData = (mockDbManager.runQuery as jest.Mock).mock.calls[0][1][1];
      const parsedState = JSON.parse(savedData as string);

      expect(parsedState.x).toBe(-1000);
      expect(parsedState.y).toBe(-500);
    });

    /* Preconditions: state with large dimensions
       Action: call saveState() with large dimensions
       Assertions: large dimensions saved correctly
       Requirements: window-management.5.1, database-refactoring.3.6, user-data-isolation.6.10 */
    it('should save large dimensions correctly', () => {
      const state: WindowState = {
        x: 0,
        y: 0,
        width: 3840,
        height: 2160,
        isMaximized: false,
      };

      windowStateManager.saveState(state);

      const savedData = (mockDbManager.runQuery as jest.Mock).mock.calls[0][1][1];
      const parsedState = JSON.parse(savedData as string);

      expect(parsedState.width).toBe(3840);
      expect(parsedState.height).toBe(2160);
    });
  });
});
