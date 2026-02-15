// Requirements: window-management.4.1, window-management.4.3

import * as fc from 'fast-check';
import { WindowStateManager } from '../../src/main/WindowStateManager';
import type { IDatabaseManager } from '../../src/main/DatabaseManager';

// Mock electron module
jest.mock('electron', () => ({
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
    close: jest.fn(),
    setSize: jest.fn(),
    setTitle: jest.fn(),
    setResizable: jest.fn(),
    setFullScreen: jest.fn(),
    maximize: jest.fn(),
    isMaximized: jest.fn().mockReturnValue(false),
    getBounds: jest.fn().mockReturnValue({ x: 100, y: 100, width: 1200, height: 800 }),
    webContents: {
      session: {
        webRequest: {
          onHeadersReceived: jest.fn(),
        },
      },
      on: jest.fn(),
    },
  })),
  screen: {
    getPrimaryDisplay: jest.fn(),
    getAllDisplays: jest.fn(),
  },
}));

describe('Property Tests - WindowStateManager', () => {
  let windowStateManager: WindowStateManager;
  let mockDbManager: jest.Mocked<IDatabaseManager>;
  let mockScreen: any;
  let mockGlobalWindowState: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    // Create mock for global.windowState repository
    // Requirements: user-data-isolation.6.8 - WindowStateManager uses dbManager.global.windowState
    mockGlobalWindowState = {
      get: jest.fn().mockReturnValue(undefined), // Default: no saved state
      set: jest.fn(),
    };

    // Create mock DatabaseManager with repository accessors
    // Requirements: database-refactoring.3.6, user-data-isolation.6.10, user-data-isolation.6.8 - WindowStateManager uses global repository
    mockDbManager = {
      getDatabase: jest.fn(),
      getCurrentUserId: jest.fn().mockReturnValue(null),
      getCurrentUserIdStrict: jest.fn().mockReturnValue(null),
      setUserManager: jest.fn(),
      // Repository accessors
      settings: {} as any,
      agents: {} as any,
      messages: {} as any,
      users: {} as any,
      global: {
        windowState: mockGlobalWindowState,
      },
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

    // Create WindowStateManager instance with DatabaseManager
    windowStateManager = new WindowStateManager(mockDbManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* Preconditions: screen API returns various screen sizes
     Action: call getDefaultState() with different screen sizes
     Assertions: returned dimensions are min(600, width) x min(400, height), centered, not hardcoded
     Requirements: window-management.4.1, window-management.4.2, window-management.4.3, window-management.4.4 */
  // Feature: ui, Property 5: Размер окна адаптируется к экрану при первом запуске
  test('Property 5: Default State Screen Adaptation - window size is based on screen size, not hardcoded', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          width: fc.integer({ min: 800, max: 3840 }),
          height: fc.integer({ min: 600, max: 2160 }),
        }),
        async (screenSize) => {
          // Mock screen API with generated screen size
          mockScreen.getPrimaryDisplay.mockReturnValue({
            workAreaSize: screenSize,
          });

          // Mock no saved state - getRow returns undefined
          mockGlobalWindowState.get.mockReturnValue(undefined);

          // Call loadState which internally calls getDefaultState
          const state = windowStateManager.loadState();

          // Calculate expected compact size: min(600, width) x min(400, height)
          const expectedWidth = Math.min(600, screenSize.width);
          const expectedHeight = Math.min(400, screenSize.height);
          const expectedX = Math.floor((screenSize.width - expectedWidth) / 2);
          const expectedY = Math.floor((screenSize.height - expectedHeight) / 2);

          // Verify dimensions are compact size (not full screen)
          expect(state.width).toBe(expectedWidth);
          expect(state.height).toBe(expectedHeight);
          expect(state.width).toBeLessThanOrEqual(screenSize.width);
          expect(state.height).toBeLessThanOrEqual(screenSize.height);
          expect(state.width).toBeGreaterThan(0);
          expect(state.height).toBeGreaterThan(0);

          // Verify window is centered on screen
          expect(state.x).toBe(expectedX);
          expect(state.y).toBe(expectedY);

          // Verify dimensions adapt to screen size (not always 600x400)
          // For screens smaller than 600x400, dimensions should be smaller
          if (screenSize.width < 600) {
            expect(state.width).toBe(screenSize.width);
          }
          if (screenSize.height < 400) {
            expect(state.height).toBe(screenSize.height);
          }

          // Verify default state is NOT maximized (window-management.1.1)
          expect(state.isMaximized).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: small screen size (800x600)
     Action: call getDefaultState()
     Assertions: window adapts to small screen with compact size min(600, 800) x min(400, 600), centered
     Requirements: window-management.4.1, window-management.4.2, window-management.4.3, window-management.4.4 */
  // Feature: ui, Property 5
  test('Property 5 edge case: small screen adaptation', () => {
    const smallScreen = { width: 800, height: 600 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: smallScreen,
    });

    // Mock no saved state - getRow returns undefined
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const state = windowStateManager.loadState();

    expect(state.width).toBe(600); // min(600, 800)
    expect(state.height).toBe(400); // min(400, 600)
    expect(state.x).toBe(100); // (800 - 600) / 2
    expect(state.y).toBe(100); // (600 - 400) / 2
    expect(state.isMaximized).toBe(false);
  });

  /* Preconditions: large 4K screen size (3840x2160)
     Action: call getDefaultState()
     Assertions: window uses compact size 600x400, centered on large screen
     Requirements: window-management.4.1, window-management.4.2, window-management.4.3, window-management.4.4 */
  // Feature: ui, Property 5
  test('Property 5 edge case: large 4K screen adaptation', () => {
    const largeScreen = { width: 3840, height: 2160 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: largeScreen,
    });

    // Mock no saved state - getRow returns undefined
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const state = windowStateManager.loadState();

    expect(state.width).toBe(600); // min(600, 3840)
    expect(state.height).toBe(400); // min(400, 2160)
    expect(state.x).toBe(1620); // (3840 - 600) / 2
    expect(state.y).toBe(880); // (2160 - 400) / 2
    expect(state.isMaximized).toBe(false);
  });

  /* Preconditions: ultrawide screen size (2560x1080)
     Action: call getDefaultState()
     Assertions: window uses compact size 600x400, centered on ultrawide screen
     Requirements: window-management.4.1, window-management.4.2, window-management.4.3, window-management.4.4 */
  // Feature: ui, Property 5
  test('Property 5 edge case: ultrawide screen adaptation', () => {
    const ultrawideScreen = { width: 2560, height: 1080 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: ultrawideScreen,
    });

    // Mock no saved state - getRow returns undefined
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const state = windowStateManager.loadState();

    expect(state.width).toBe(600); // min(600, 2560)
    expect(state.height).toBe(400); // min(400, 1080)
    expect(state.x).toBe(980); // (2560 - 600) / 2
    expect(state.y).toBe(340); // (1080 - 400) / 2
    expect(state.isMaximized).toBe(false);
  });

  /* Preconditions: portrait orientation screen (1080x1920)
     Action: call getDefaultState()
     Assertions: window uses compact size 600x400, centered on portrait screen
     Requirements: window-management.4.1, window-management.4.2, window-management.4.3, window-management.4.4 */
  // Feature: ui, Property 5
  test('Property 5 edge case: portrait orientation adaptation', () => {
    const portraitScreen = { width: 1080, height: 1920 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: portraitScreen,
    });

    // Mock no saved state - getRow returns undefined
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const state = windowStateManager.loadState();

    expect(state.width).toBe(600); // min(600, 1080)
    expect(state.height).toBe(400); // min(400, 1920)
    expect(state.x).toBe(240); // (1080 - 600) / 2
    expect(state.y).toBe(760); // (1920 - 400) / 2
    expect(state.isMaximized).toBe(false);
  });

  /* Preconditions: minimum viable screen size (800x600)
     Action: call getDefaultState()
     Assertions: window dimensions are positive and within bounds
     Requirements: window-management.4.1, window-management.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: minimum screen size boundary', () => {
    const minScreen = { width: 800, height: 600 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: minScreen,
    });

    // Mock no saved state - getRow returns undefined
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const state = windowStateManager.loadState();

    // Verify positive dimensions
    expect(state.width).toBeGreaterThan(0);
    expect(state.height).toBeGreaterThan(0);
    expect(state.x).toBeGreaterThanOrEqual(0);
    expect(state.y).toBeGreaterThanOrEqual(0);

    // Verify within screen bounds
    expect(state.width).toBeLessThanOrEqual(minScreen.width);
    expect(state.height).toBeLessThanOrEqual(minScreen.height);
  });

  /* Preconditions: maximum screen size (3840x2160)
     Action: call getDefaultState()
     Assertions: window dimensions are positive and within bounds
     Requirements: window-management.4.1, window-management.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: maximum screen size boundary', () => {
    const maxScreen = { width: 3840, height: 2160 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: maxScreen,
    });

    // Mock no saved state - getRow returns undefined
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const state = windowStateManager.loadState();

    // Verify positive dimensions
    expect(state.width).toBeGreaterThan(0);
    expect(state.height).toBeGreaterThan(0);
    expect(state.x).toBeGreaterThanOrEqual(0);
    expect(state.y).toBeGreaterThanOrEqual(0);

    // Verify within screen bounds
    expect(state.width).toBeLessThanOrEqual(maxScreen.width);
    expect(state.height).toBeLessThanOrEqual(maxScreen.height);
  });

  /* Preconditions: various common screen resolutions
     Action: call getDefaultState() for each resolution
     Assertions: dimensions are compact size min(600, width) x min(400, height), centered
     Requirements: window-management.4.1, window-management.4.2, window-management.4.3, window-management.4.4 */
  // Feature: ui, Property 5
  test('Property 5 edge case: common screen resolutions', () => {
    const commonResolutions = [
      { width: 1366, height: 768 }, // HD
      { width: 1920, height: 1080 }, // Full HD
      { width: 2560, height: 1440 }, // QHD
      { width: 3840, height: 2160 }, // 4K UHD
      { width: 1440, height: 900 }, // WXGA+
      { width: 1680, height: 1050 }, // WSXGA+
      { width: 2560, height: 1600 }, // WQXGA
    ];

    commonResolutions.forEach((resolution) => {
      mockScreen.getPrimaryDisplay.mockReturnValue({
        workAreaSize: resolution,
      });

      // Mock no saved state - getRow returns undefined
      mockGlobalWindowState.get.mockReturnValue(undefined);

      const state = windowStateManager.loadState();

      // Calculate expected compact size
      const expectedWidth = Math.min(600, resolution.width);
      const expectedHeight = Math.min(400, resolution.height);
      const expectedX = Math.floor((resolution.width - expectedWidth) / 2);
      const expectedY = Math.floor((resolution.height - expectedHeight) / 2);

      // Verify dimensions are compact size
      expect(state.width).toBe(expectedWidth);
      expect(state.height).toBe(expectedHeight);
      expect(state.x).toBe(expectedX);
      expect(state.y).toBe(expectedY);

      expect(state.isMaximized).toBe(false);
    });
  });

  /* Preconditions: screen size with odd dimensions
     Action: call getDefaultState()
     Assertions: Math.floor correctly handles fractional calculations for centering
     Requirements: window-management.4.1, window-management.4.2, window-management.4.3, window-management.4.4 */
  // Feature: ui, Property 5
  test('Property 5 edge case: odd screen dimensions', () => {
    const oddScreen = { width: 1367, height: 769 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: oddScreen,
    });

    // Mock no saved state - getRow returns undefined
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const state = windowStateManager.loadState();

    // Verify dimensions are compact size
    expect(state.width).toBe(600); // min(600, 1367)
    expect(state.height).toBe(400); // min(400, 769)
    expect(state.x).toBe(383); // Math.floor((1367 - 600) / 2)
    expect(state.y).toBe(184); // Math.floor((769 - 400) / 2)

    // Verify integer values
    expect(Number.isInteger(state.width)).toBe(true);
    expect(Number.isInteger(state.height)).toBe(true);
    expect(Number.isInteger(state.x)).toBe(true);
    expect(Number.isInteger(state.y)).toBe(true);
  });

  /* Preconditions: multiple calls with same screen size
     Action: call getDefaultState() multiple times
     Assertions: returns consistent results (deterministic)
     Requirements: window-management.4.1, window-management.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: consistent results for same screen size', () => {
    const screenSize = { width: 1920, height: 1080 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: screenSize,
    });

    // Mock no saved state - getRow returns undefined
    mockGlobalWindowState.get.mockReturnValue(undefined);

    // Call multiple times
    const state1 = windowStateManager.loadState();
    const state2 = windowStateManager.loadState();
    const state3 = windowStateManager.loadState();

    // Verify all results are identical
    expect(state1).toEqual(state2);
    expect(state2).toEqual(state3);
  });

  /* Preconditions: screen size changes between calls
     Action: call getDefaultState() with different screen sizes
     Assertions: each call returns compact size based on current screen size
     Requirements: window-management.4.1, window-management.4.2, window-management.4.3, window-management.4.4 */
  // Feature: ui, Property 5
  test('Property 5 edge case: adapts to screen size changes', () => {
    // First screen size
    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    });

    // Mock no saved state - getRow returns undefined
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const state1 = windowStateManager.loadState();
    expect(state1.width).toBe(600); // min(600, 1920)
    expect(state1.height).toBe(400); // min(400, 1080)

    // Change screen size
    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 2560, height: 1440 },
    });

    const state2 = windowStateManager.loadState();
    expect(state2.width).toBe(600); // min(600, 2560)
    expect(state2.height).toBe(400); // min(400, 1440)

    // Both should have compact size (600x400) since both screens are larger
    expect(state1.width).toBe(state2.width);
    expect(state1.height).toBe(state2.height);
  });

  /* Preconditions: valid window state with various values
     Action: save state then load state
     Assertions: loaded state equals saved state (for valid positions)
     Requirements: window-management.5.4 */
  // Feature: ui, Property 7: Round-trip сохранения и загрузки состояния
  test('Property 7: State Persistence Round-trip - state is preserved through save/load cycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          x: fc.integer({ min: 0, max: 2000 }),
          y: fc.integer({ min: 0, max: 2000 }),
          width: fc.integer({ min: 400, max: 3000 }),
          height: fc.integer({ min: 300, max: 2000 }),
          isMaximized: fc.boolean(),
        }),
        async (state) => {
          // Mock screen to make position valid
          // Create a display that contains the generated position
          mockScreen.getAllDisplays.mockReturnValue([
            {
              bounds: {
                x: 0,
                y: 0,
                width: Math.max(3000, state.x + 100),
                height: Math.max(2500, state.y + 100),
              },
            },
          ]);

          // Create mock for save/load cycle using mockGlobalWindowState
          let savedValue: any = undefined;
          mockGlobalWindowState.set.mockImplementation((value: any) => {
            savedValue = value;
          });
          mockGlobalWindowState.get.mockImplementation(() => savedValue);

          // Save the state
          windowStateManager.saveState(state);

          // Load the state
          const loadedState = windowStateManager.loadState();

          // Verify the loaded state equals the saved state
          expect(loadedState).toEqual(state);
          expect(loadedState.x).toBe(state.x);
          expect(loadedState.y).toBe(state.y);
          expect(loadedState.width).toBe(state.width);
          expect(loadedState.height).toBe(state.height);
          expect(loadedState.isMaximized).toBe(state.isMaximized);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: state with position outside screen bounds
     Action: save state then load state
     Assertions: loaded state is default state (invalid position rejected)
     Requirements: window-management.5.4, window-management.5.6 */
  // Feature: ui, Property 7
  test('Property 7 edge case: invalid position returns default state', () => {
    const invalidState = {
      x: 5000, // Outside any display
      y: 5000,
      width: 800,
      height: 600,
      isMaximized: false,
    };

    // Mock screen with limited bounds
    mockScreen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    });

    // Mock database to return the invalid state via getRow
    mockGlobalWindowState.get.mockReturnValue(invalidState);

    // Load the state
    const loadedState = windowStateManager.loadState();

    // Verify default state is returned (position is invalid)
    expect(loadedState).not.toEqual(invalidState);
    expect(loadedState.isMaximized).toBe(false);
    expect(loadedState.width).toBe(600); // Compact size: min(600, 1920)
    expect(loadedState.height).toBe(400); // Compact size: min(400, 1080)
  });

  /* Preconditions: state with negative coordinates
     Action: save state then load state
     Assertions: handles negative coordinates correctly (multi-monitor setup)
     Requirements: window-management.5.4 */
  // Feature: ui, Property 7
  test('Property 7 edge case: negative coordinates for multi-monitor setup', () => {
    const stateWithNegativeCoords = {
      x: -1920, // Second monitor to the left
      y: 0,
      width: 1200,
      height: 800,
      isMaximized: false,
    };

    // Mock multi-monitor setup with negative coordinates
    mockScreen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, // Left monitor
      },
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 }, // Primary monitor
      },
    ]);

    // Mock database to return the state with negative coords via getRow
    mockGlobalWindowState.get.mockReturnValue(stateWithNegativeCoords);

    // Load the state
    const loadedState = windowStateManager.loadState();

    // Verify the state is preserved (negative coordinates are valid)
    expect(loadedState).toEqual(stateWithNegativeCoords);
    expect(loadedState.x).toBe(-1920);
  });

  /* Preconditions: state with boundary coordinates
     Action: save state then load state
     Assertions: boundary coordinates are preserved correctly
     Requirements: window-management.5.4 */
  // Feature: ui, Property 7
  test('Property 7 edge case: boundary coordinates', () => {
    const boundaryState = {
      x: 0,
      y: 0,
      width: 400, // Minimum width
      height: 300, // Minimum height
      isMaximized: false,
    };

    // Mock screen
    mockScreen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    // Mock database to return the boundary state via getRow
    mockGlobalWindowState.get.mockReturnValue(boundaryState);

    // Load the state
    const loadedState = windowStateManager.loadState();

    // Verify boundary values are preserved
    expect(loadedState).toEqual(boundaryState);
    expect(loadedState.x).toBe(0);
    expect(loadedState.y).toBe(0);
    expect(loadedState.width).toBe(400);
    expect(loadedState.height).toBe(300);
  });

  /* Preconditions: state with maximum dimensions
     Action: save state then load state
     Assertions: large dimensions are preserved correctly
     Requirements: window-management.5.4 */
  // Feature: ui, Property 7
  test('Property 7 edge case: maximum dimensions', () => {
    const maxState = {
      x: 100,
      y: 100,
      width: 3000,
      height: 2000,
      isMaximized: true,
    };

    // Mock large screen
    mockScreen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 3840, height: 2160 },
      },
    ]);

    // Mock database to return the max state via getRow
    mockGlobalWindowState.get.mockReturnValue(maxState);

    // Load the state
    const loadedState = windowStateManager.loadState();

    // Verify large dimensions are preserved
    expect(loadedState).toEqual(maxState);
    expect(loadedState.width).toBe(3000);
    expect(loadedState.height).toBe(2000);
  });

  /* Preconditions: multiple save/load cycles
     Action: save, load, save again, load again
     Assertions: state remains consistent across multiple cycles
     Requirements: window-management.5.4 */
  // Feature: ui, Property 7
  test('Property 7 edge case: multiple save/load cycles', () => {
    const originalState = {
      x: 100,
      y: 100,
      width: 1200,
      height: 800,
      isMaximized: false,
    };

    // Mock screen
    mockScreen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    // Create mock for save/load cycle using mockGlobalWindowState
    let savedValue: any = undefined;
    mockGlobalWindowState.set.mockImplementation((value: any) => {
      savedValue = value;
    });
    mockGlobalWindowState.get.mockImplementation(() => savedValue);

    // First cycle: save and load
    windowStateManager.saveState(originalState);
    const loadedState1 = windowStateManager.loadState();
    expect(loadedState1).toEqual(originalState);

    // Second cycle: save the loaded state and load again
    windowStateManager.saveState(loadedState1);
    const loadedState2 = windowStateManager.loadState();
    expect(loadedState2).toEqual(originalState);

    // Third cycle: verify consistency
    windowStateManager.saveState(loadedState2);
    const loadedState3 = windowStateManager.loadState();
    expect(loadedState3).toEqual(originalState);
  });

  /* Preconditions: state with isMaximized true and false
     Action: save and load both states
     Assertions: isMaximized flag is preserved correctly
     Requirements: window-management.5.4 */
  // Feature: ui, Property 7
  test('Property 7 edge case: isMaximized flag preservation', () => {
    const maximizedState = {
      x: 100,
      y: 100,
      width: 1200,
      height: 800,
      isMaximized: true,
    };

    const normalState = {
      x: 200,
      y: 200,
      width: 1000,
      height: 700,
      isMaximized: false,
    };

    // Mock screen
    mockScreen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    // Create mock for save/load cycle using mockGlobalWindowState
    let savedValue: any = undefined;
    mockGlobalWindowState.set.mockImplementation((value: any) => {
      savedValue = value;
    });
    mockGlobalWindowState.get.mockImplementation(() => savedValue);

    // Test maximized state
    windowStateManager.saveState(maximizedState);
    const loadedMaximized = windowStateManager.loadState();
    expect(loadedMaximized.isMaximized).toBe(true);

    // Test normal state
    windowStateManager.saveState(normalState);
    const loadedNormal = windowStateManager.loadState();
    expect(loadedNormal.isMaximized).toBe(false);
  });

  /* Preconditions: corrupted JSON data in storage
     Action: attempt to load corrupted state
     Assertions: returns default state gracefully
     Requirements: window-management.5.4, window-management.5.5 */
  // Feature: ui, Property 7
  test('Property 7 edge case: corrupted data returns default state', () => {
    // Mock corrupted data via mockGlobalWindowState.get - returns invalid object
    mockGlobalWindowState.get.mockReturnValue({ invalid: 'data' });

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    });

    // Load state
    const loadedState = windowStateManager.loadState();

    // Verify default state is returned
    expect(loadedState.isMaximized).toBe(false);
    expect(loadedState.width).toBe(600); // Compact size: min(600, 1920)
    expect(loadedState.height).toBe(400); // Compact size: min(400, 1080)
  });

  /* Preconditions: empty data in storage
     Action: attempt to load empty state
     Assertions: returns default state
     Requirements: window-management.5.4, window-management.5.5 */
  // Feature: ui, Property 7
  test('Property 7 edge case: empty data returns default state', () => {
    // Mock empty data via mockGlobalWindowState.get
    mockGlobalWindowState.get.mockReturnValue(null);

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    });

    // Load state
    const loadedState = windowStateManager.loadState();

    // Verify default state is returned
    expect(loadedState.isMaximized).toBe(false);
    expect(loadedState.width).toBe(600); // Compact size: min(600, 1920)
    expect(loadedState.height).toBe(400); // Compact size: min(400, 1080)
  });

  /* Preconditions: loadData returns success: false
     Action: attempt to load state
     Assertions: returns default state
     Requirements: window-management.5.4, window-management.5.5 */
  // Feature: ui, Property 7
  test('Property 7 edge case: failed load returns default state', () => {
    // Mock no data in database via getRow
    mockGlobalWindowState.get.mockReturnValue(undefined);

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    });

    // Load state
    const loadedState = windowStateManager.loadState();

    // Verify default state is returned
    expect(loadedState.isMaximized).toBe(false);
    expect(loadedState.width).toBe(600); // Compact size: min(600, 1920)
    expect(loadedState.height).toBe(400); // Compact size: min(400, 1080)
  });
});

// Additional tests for WindowManager integration with state changes
describe('Property Tests - WindowManager State Changes', () => {
  let mockDbManager: jest.Mocked<IDatabaseManager>;
  let mockScreen: any;
  let mockGlobalWindowState: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock for global.windowState repository
    // Requirements: user-data-isolation.6.8 - WindowStateManager uses dbManager.global.windowState
    let savedValue: any = undefined;
    mockGlobalWindowState = {
      get: jest.fn().mockImplementation(() => savedValue),
      set: jest.fn().mockImplementation((value: any) => {
        savedValue = value;
      }),
    };

    // Create mock DatabaseManager with repository accessors
    // Requirements: database-refactoring.3.6, user-data-isolation.6.10, user-data-isolation.6.8 - WindowStateManager uses global repository
    mockDbManager = {
      getDatabase: jest.fn(),
      getCurrentUserId: jest.fn().mockReturnValue(null),
      getCurrentUserIdStrict: jest.fn().mockReturnValue(null),
      setUserManager: jest.fn(),
      // Repository accessors
      settings: {} as any,
      agents: {} as any,
      messages: {} as any,
      users: {} as any,
      global: {
        windowState: mockGlobalWindowState,
      },
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
        bounds: { x: 0, y: 0, width: 3000, height: 2500 },
      },
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* Preconditions: window created with various initial states
     Action: trigger resize/move/maximize events
     Assertions: Database saveState called with updated state
     Requirements: window-management.5.1, window-management.5.2, window-management.5.3 */
  // Feature: ui, Property 6: Изменения состояния окна сохраняются
  test('Property 6: Window State Persistence - state is saved on any window state change', async () => {
    // Import WindowManager here to use the mocked electron
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          x: fc.integer({ min: 0, max: 2000 }),
          y: fc.integer({ min: 0, max: 2000 }),
          width: fc.integer({ min: 400, max: 3000 }),
          height: fc.integer({ min: 300, max: 2000 }),
          isMaximized: fc.boolean(),
        }),
        async (newState) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();

          // Track saved values using mockGlobalWindowState.set
          let lastSavedState: any = null;
          mockGlobalWindowState.set.mockImplementation((value: any) => {
            lastSavedState = value;
          });
          mockGlobalWindowState.get.mockReturnValue(undefined);

          // Create WindowManager instance
          const windowManager = new WindowManager(mockDbManager);

          // Create window
          windowManager.createWindow();

          // Get the mock window instance
          const MockedBrowserWindow = BrowserWindow as jest.MockedClass<typeof BrowserWindow>;
          const mockWindow =
            MockedBrowserWindow.mock.results[MockedBrowserWindow.mock.results.length - 1].value;

          // Setup mock window methods to return the new state
          mockWindow.getBounds.mockReturnValue({
            x: newState.x,
            y: newState.y,
            width: newState.width,
            height: newState.height,
          });
          mockWindow.isMaximized.mockReturnValue(newState.isMaximized);

          // Get the event handlers that were registered
          const resizeHandler = mockWindow.on.mock.calls.find(
            (call: any[]) => call[0] === 'resize'
          )?.[1];
          const moveHandler = mockWindow.on.mock.calls.find(
            (call: any[]) => call[0] === 'move'
          )?.[1];
          const maximizeHandler = mockWindow.on.mock.calls.find(
            (call: any[]) => call[0] === 'maximize'
          )?.[1];

          // Clear saved state from window creation
          lastSavedState = null;

          // Trigger resize event
          if (resizeHandler) {
            resizeHandler();
          }

          // Verify state was saved
          expect(lastSavedState).not.toBeNull();
          expect(lastSavedState.x).toBe(newState.x);
          expect(lastSavedState.y).toBe(newState.y);
          expect(lastSavedState.width).toBe(newState.width);
          expect(lastSavedState.height).toBe(newState.height);
          expect(lastSavedState.isMaximized).toBe(newState.isMaximized);

          // Clear for next event
          lastSavedState = null;

          // Trigger move event
          if (moveHandler) {
            moveHandler();
          }

          // Verify state was saved again
          expect(lastSavedState).not.toBeNull();
          expect(lastSavedState.x).toBe(newState.x);
          expect(lastSavedState.y).toBe(newState.y);

          // Clear for next event
          lastSavedState = null;

          // Trigger maximize event if applicable
          if (maximizeHandler && newState.isMaximized) {
            maximizeHandler();

            // Verify state was saved
            expect(lastSavedState).not.toBeNull();
            expect(lastSavedState.isMaximized).toBe(true);
          }

          // Clean up
          windowManager.closeWindow();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: window created, bounds change
     Action: trigger resize event
     Assertions: saveState called with updated bounds
     Requirements: window-management.5.1 */
  // Feature: ui, Property 6
  test('Property 6 edge case: resize event saves updated bounds', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    // Track saved values using mockGlobalWindowState.set
    let lastSavedState: any = null;
    mockGlobalWindowState.set.mockImplementation((value: any) => {
      lastSavedState = value;
    });
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const windowManager = new WindowManager(mockDbManager);
    windowManager.createWindow();

    const MockedBrowserWindow = BrowserWindow as jest.MockedClass<typeof BrowserWindow>;
    const mockWindow =
      MockedBrowserWindow.mock.results[MockedBrowserWindow.mock.results.length - 1].value;

    // Setup new bounds
    mockWindow.getBounds.mockReturnValue({
      x: 150,
      y: 150,
      width: 1400,
      height: 900,
    });
    mockWindow.isMaximized.mockReturnValue(false);

    // Get resize handler
    const resizeHandler = mockWindow.on.mock.calls.find((call: any[]) => call[0] === 'resize')?.[1];

    // Clear previous saved state
    lastSavedState = null;

    // Trigger resize
    if (resizeHandler) {
      resizeHandler();
    }

    // Verify save was called
    expect(lastSavedState).not.toBeNull();
    expect(lastSavedState.width).toBe(1400);
    expect(lastSavedState.height).toBe(900);

    windowManager.closeWindow();
  });

  /* Preconditions: window created, position changes
     Action: trigger move event
     Assertions: saveState called with updated position
     Requirements: window-management.5.2 */
  // Feature: ui, Property 6
  test('Property 6 edge case: move event saves updated position', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    // Track saved values using mockGlobalWindowState.set
    let lastSavedState: any = null;
    mockGlobalWindowState.set.mockImplementation((value: any) => {
      lastSavedState = value;
    });
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const windowManager = new WindowManager(mockDbManager);
    windowManager.createWindow();

    const MockedBrowserWindow = BrowserWindow as jest.MockedClass<typeof BrowserWindow>;
    const mockWindow =
      MockedBrowserWindow.mock.results[MockedBrowserWindow.mock.results.length - 1].value;

    // Setup new position
    mockWindow.getBounds.mockReturnValue({
      x: 250,
      y: 300,
      width: 1200,
      height: 800,
    });
    mockWindow.isMaximized.mockReturnValue(false);

    // Get move handler
    const moveHandler = mockWindow.on.mock.calls.find((call: any[]) => call[0] === 'move')?.[1];

    // Clear previous saved state
    lastSavedState = null;

    // Trigger move
    if (moveHandler) {
      moveHandler();
    }

    // Verify save was called
    expect(lastSavedState).not.toBeNull();
    expect(lastSavedState.x).toBe(250);
    expect(lastSavedState.y).toBe(300);

    windowManager.closeWindow();
  });

  /* Preconditions: window created, window maximized
     Action: trigger maximize event
     Assertions: saveState called with isMaximized: true
     Requirements: window-management.5.3 */
  // Feature: ui, Property 6
  test('Property 6 edge case: maximize event saves maximized state', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    // Track saved values using mockGlobalWindowState.set
    let lastSavedState: any = null;
    mockGlobalWindowState.set.mockImplementation((value: any) => {
      lastSavedState = value;
    });
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const windowManager = new WindowManager(mockDbManager);
    windowManager.createWindow();

    const MockedBrowserWindow = BrowserWindow as jest.MockedClass<typeof BrowserWindow>;
    const mockWindow =
      MockedBrowserWindow.mock.results[MockedBrowserWindow.mock.results.length - 1].value;

    // Setup maximized state
    mockWindow.getBounds.mockReturnValue({
      x: 100,
      y: 100,
      width: 1728,
      height: 972,
    });
    mockWindow.isMaximized.mockReturnValue(true);

    // Get maximize handler
    const maximizeHandler = mockWindow.on.mock.calls.find(
      (call: any[]) => call[0] === 'maximize'
    )?.[1];

    // Clear previous saved state
    lastSavedState = null;

    // Trigger maximize
    if (maximizeHandler) {
      maximizeHandler();
    }

    // Verify save was called with isMaximized: true
    expect(lastSavedState).not.toBeNull();
    expect(lastSavedState.isMaximized).toBe(true);

    windowManager.closeWindow();
  });

  /* Preconditions: window created and maximized, window unmaximized
     Action: trigger unmaximize event
     Assertions: saveState called with isMaximized: false
     Requirements: window-management.5.3 */
  // Feature: ui, Property 6
  test('Property 6 edge case: unmaximize event saves normal state', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    // Track saved values using mockGlobalWindowState.set
    let lastSavedState: any = null;
    mockGlobalWindowState.set.mockImplementation((value: any) => {
      lastSavedState = value;
    });
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const windowManager = new WindowManager(mockDbManager);
    windowManager.createWindow();

    const MockedBrowserWindow = BrowserWindow as jest.MockedClass<typeof BrowserWindow>;
    const mockWindow =
      MockedBrowserWindow.mock.results[MockedBrowserWindow.mock.results.length - 1].value;

    // Setup normal state
    mockWindow.getBounds.mockReturnValue({
      x: 100,
      y: 100,
      width: 1200,
      height: 800,
    });
    mockWindow.isMaximized.mockReturnValue(false);

    // Get unmaximize handler
    const unmaximizeHandler = mockWindow.on.mock.calls.find(
      (call: any[]) => call[0] === 'unmaximize'
    )?.[1];

    // Clear previous saved state
    lastSavedState = null;

    // Trigger unmaximize
    if (unmaximizeHandler) {
      unmaximizeHandler();
    }

    // Verify save was called with isMaximized: false
    expect(lastSavedState).not.toBeNull();
    expect(lastSavedState.isMaximized).toBe(false);

    windowManager.closeWindow();
  });

  /* Preconditions: window created, multiple state changes occur
     Action: trigger multiple events in sequence
     Assertions: saveState called for each event with correct state
     Requirements: window-management.5.1, window-management.5.2, window-management.5.3 */
  // Feature: ui, Property 6
  test('Property 6 edge case: multiple state changes save correctly', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    // Track saved values using mockGlobalWindowState.set
    let saveCount = 0;
    mockGlobalWindowState.set.mockImplementation(() => {
      saveCount++;
    });
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const windowManager = new WindowManager(mockDbManager);
    windowManager.createWindow();

    const MockedBrowserWindow = BrowserWindow as jest.MockedClass<typeof BrowserWindow>;
    const mockWindow =
      MockedBrowserWindow.mock.results[MockedBrowserWindow.mock.results.length - 1].value;

    // Get event handlers
    const resizeHandler = mockWindow.on.mock.calls.find((call: any[]) => call[0] === 'resize')?.[1];
    const moveHandler = mockWindow.on.mock.calls.find((call: any[]) => call[0] === 'move')?.[1];
    const maximizeHandler = mockWindow.on.mock.calls.find(
      (call: any[]) => call[0] === 'maximize'
    )?.[1];

    // Clear previous save count
    saveCount = 0;

    // First change: resize
    mockWindow.getBounds.mockReturnValue({ x: 100, y: 100, width: 1400, height: 900 });
    mockWindow.isMaximized.mockReturnValue(false);
    if (resizeHandler) resizeHandler();
    expect(saveCount).toBe(1);

    // Second change: move
    mockWindow.getBounds.mockReturnValue({ x: 200, y: 150, width: 1400, height: 900 });
    if (moveHandler) moveHandler();
    expect(saveCount).toBe(2);

    // Third change: maximize
    mockWindow.isMaximized.mockReturnValue(true);
    if (maximizeHandler) maximizeHandler();
    expect(saveCount).toBe(3);

    windowManager.closeWindow();
  });

  /* Preconditions: window created, window closed
     Action: trigger close event
     Assertions: saveState called with final state
     Requirements: window-management.5.1, window-management.5.2, window-management.5.3 */
  // Feature: ui, Property 6
  test('Property 6 edge case: close event saves final state', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    // Track saved values using mockGlobalWindowState.set
    let lastSavedState: any = null;
    mockGlobalWindowState.set.mockImplementation((value: any) => {
      lastSavedState = value;
    });
    mockGlobalWindowState.get.mockReturnValue(undefined);

    const windowManager = new WindowManager(mockDbManager);
    windowManager.createWindow();

    const MockedBrowserWindow = BrowserWindow as jest.MockedClass<typeof BrowserWindow>;
    const mockWindow =
      MockedBrowserWindow.mock.results[MockedBrowserWindow.mock.results.length - 1].value;

    // Setup final state
    mockWindow.getBounds.mockReturnValue({
      x: 300,
      y: 200,
      width: 1600,
      height: 1000,
    });
    mockWindow.isMaximized.mockReturnValue(true);

    // Get close handler
    const closeHandler = mockWindow.on.mock.calls.find((call: any[]) => call[0] === 'close')?.[1];

    // Clear previous saved state
    lastSavedState = null;

    // Trigger close
    if (closeHandler) {
      closeHandler();
    }

    // Verify save was called with final state
    expect(lastSavedState).not.toBeNull();
    expect(lastSavedState.x).toBe(300);
    expect(lastSavedState.y).toBe(200);
    expect(lastSavedState.width).toBe(1600);
    expect(lastSavedState.height).toBe(1000);
    expect(lastSavedState.isMaximized).toBe(true);

    windowManager.closeWindow();
  });
});
