// Requirements: ui.4.1, ui.4.3

import * as fc from 'fast-check';
import { WindowStateManager } from '../../src/main/WindowStateManager';
import { DataManager } from '../../src/main/DataManager';

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

  /* Preconditions: screen API returns various screen sizes
     Action: call getDefaultState() with different screen sizes
     Assertions: returned dimensions are proportional to screen size, not hardcoded
     Requirements: ui.4.1, ui.4.3 */
  // Feature: ui, Property 5: Размер окна основан на размере экрана
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

          // Mock no saved state to trigger default state generation
          mockDataManager.loadData.mockReturnValue({ success: false });

          // Call loadState which internally calls getDefaultState
          const state = windowStateManager.loadState();

          // Verify dimensions are proportional to screen size
          expect(state.width).toBeLessThanOrEqual(screenSize.width);
          expect(state.height).toBeLessThanOrEqual(screenSize.height);
          expect(state.width).toBeGreaterThan(0);
          expect(state.height).toBeGreaterThan(0);

          // Verify dimensions match workAreaSize (100% of available screen)
          expect(state.width).toBe(screenSize.width);
          expect(state.height).toBe(screenSize.height);

          // Verify position is at (0, 0)
          expect(state.x).toBe(0);
          expect(state.y).toBe(0);

          // Verify dimensions are not hardcoded to 1920x1080
          // Only check when screen size is different from 1920x1080
          if (screenSize.width !== 1920 || screenSize.height !== 1080) {
            // Verify that dimensions match the screen size, not hardcoded values
            expect(state.width).toBe(screenSize.width);
            expect(state.height).toBe(screenSize.height);
          }

          // Verify default state is NOT maximized (ui.1.1)
          expect(state.isMaximized).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: small screen size (800x600)
     Action: call getDefaultState()
     Assertions: window adapts to small screen, does not exceed bounds
     Requirements: ui.4.1, ui.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: small screen adaptation', () => {
    const smallScreen = { width: 800, height: 600 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: smallScreen,
    });

    mockDataManager.loadData.mockReturnValue({ success: false });

    const state = windowStateManager.loadState();

    expect(state.width).toBe(800);
    expect(state.height).toBe(600);
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.isMaximized).toBe(false);
  });

  /* Preconditions: large 4K screen size (3840x2160)
     Action: call getDefaultState()
     Assertions: window adapts to large screen, dimensions are proportional
     Requirements: ui.4.1, ui.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: large 4K screen adaptation', () => {
    const largeScreen = { width: 3840, height: 2160 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: largeScreen,
    });

    mockDataManager.loadData.mockReturnValue({ success: false });

    const state = windowStateManager.loadState();

    expect(state.width).toBe(3840);
    expect(state.height).toBe(2160);
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.isMaximized).toBe(false);
  });

  /* Preconditions: ultrawide screen size (2560x1080)
     Action: call getDefaultState()
     Assertions: window adapts to ultrawide aspect ratio
     Requirements: ui.4.1, ui.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: ultrawide screen adaptation', () => {
    const ultrawideScreen = { width: 2560, height: 1080 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: ultrawideScreen,
    });

    mockDataManager.loadData.mockReturnValue({ success: false });

    const state = windowStateManager.loadState();

    expect(state.width).toBe(2560);
    expect(state.height).toBe(1080);
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.isMaximized).toBe(false);
  });

  /* Preconditions: portrait orientation screen (1080x1920)
     Action: call getDefaultState()
     Assertions: window adapts to portrait orientation
     Requirements: ui.4.1, ui.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: portrait orientation adaptation', () => {
    const portraitScreen = { width: 1080, height: 1920 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: portraitScreen,
    });

    mockDataManager.loadData.mockReturnValue({ success: false });

    const state = windowStateManager.loadState();

    expect(state.width).toBe(1080);
    expect(state.height).toBe(1920);
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.isMaximized).toBe(false);
  });

  /* Preconditions: minimum viable screen size (800x600)
     Action: call getDefaultState()
     Assertions: window dimensions are positive and within bounds
     Requirements: ui.4.1, ui.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: minimum screen size boundary', () => {
    const minScreen = { width: 800, height: 600 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: minScreen,
    });

    mockDataManager.loadData.mockReturnValue({ success: false });

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
     Requirements: ui.4.1, ui.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: maximum screen size boundary', () => {
    const maxScreen = { width: 3840, height: 2160 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: maxScreen,
    });

    mockDataManager.loadData.mockReturnValue({ success: false });

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
     Assertions: dimensions are never hardcoded, always proportional
     Requirements: ui.4.1, ui.4.3 */
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

      mockDataManager.loadData.mockReturnValue({ success: false });

      const state = windowStateManager.loadState();

      // Verify dimensions match workAreaSize
      expect(state.width).toBe(resolution.width);
      expect(state.height).toBe(resolution.height);
      expect(state.x).toBe(0);
      expect(state.y).toBe(0);

      // Verify not hardcoded (except when resolution is exactly 1920x1080)
      if (resolution.width !== 1920 || resolution.height !== 1080) {
        expect(state.width).not.toBe(1920);
        expect(state.height).not.toBe(1080);
      }

      expect(state.isMaximized).toBe(false);
    });
  });

  /* Preconditions: screen size with odd dimensions
     Action: call getDefaultState()
     Assertions: Math.floor correctly handles fractional calculations
     Requirements: ui.4.1, ui.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: odd screen dimensions', () => {
    const oddScreen = { width: 1367, height: 769 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: oddScreen,
    });

    mockDataManager.loadData.mockReturnValue({ success: false });

    const state = windowStateManager.loadState();

    // Verify dimensions match workAreaSize
    expect(state.width).toBe(1367);
    expect(state.height).toBe(769);
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);

    // Verify integer values
    expect(Number.isInteger(state.width)).toBe(true);
    expect(Number.isInteger(state.height)).toBe(true);
    expect(Number.isInteger(state.x)).toBe(true);
    expect(Number.isInteger(state.y)).toBe(true);
  });

  /* Preconditions: multiple calls with same screen size
     Action: call getDefaultState() multiple times
     Assertions: returns consistent results (deterministic)
     Requirements: ui.4.1, ui.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: consistent results for same screen size', () => {
    const screenSize = { width: 1920, height: 1080 };

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: screenSize,
    });

    mockDataManager.loadData.mockReturnValue({ success: false });

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
     Assertions: each call returns dimensions based on current screen size
     Requirements: ui.4.1, ui.4.3 */
  // Feature: ui, Property 5
  test('Property 5 edge case: adapts to screen size changes', () => {
    // First screen size
    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    });

    mockDataManager.loadData.mockReturnValue({ success: false });

    const state1 = windowStateManager.loadState();
    expect(state1.width).toBe(1920);
    expect(state1.height).toBe(1080);

    // Change screen size
    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 2560, height: 1440 },
    });

    const state2 = windowStateManager.loadState();
    expect(state2.width).toBe(2560);
    expect(state2.height).toBe(1440);

    // Verify states are different
    expect(state1.width).not.toBe(state2.width);
    expect(state1.height).not.toBe(state2.height);
  });

  /* Preconditions: valid window state with various values
     Action: save state then load state
     Assertions: loaded state equals saved state (for valid positions)
     Requirements: ui.5.4 */
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

          // Save the state
          windowStateManager.saveState(state);

          // Verify saveData was called with correct parameters
          expect(mockDataManager.saveData).toHaveBeenCalledWith(
            'window_state',
            JSON.stringify(state)
          );

          // Mock loadData to return the saved state
          mockDataManager.loadData.mockReturnValue({
            success: true,
            data: JSON.stringify(state),
          });

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
     Requirements: ui.5.4, ui.5.6 */
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

    // Save the invalid state
    windowStateManager.saveState(invalidState);

    // Mock loadData to return the saved state
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: JSON.stringify(invalidState),
    });

    // Load the state
    const loadedState = windowStateManager.loadState();

    // Verify default state is returned (position is invalid)
    expect(loadedState).not.toEqual(invalidState);
    expect(loadedState.isMaximized).toBe(false);
    expect(loadedState.width).toBe(1920);
    expect(loadedState.height).toBe(1080);
  });

  /* Preconditions: state with negative coordinates
     Action: save state then load state
     Assertions: handles negative coordinates correctly (multi-monitor setup)
     Requirements: ui.5.4 */
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

    // Save the state
    windowStateManager.saveState(stateWithNegativeCoords);

    // Mock loadData to return the saved state
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: JSON.stringify(stateWithNegativeCoords),
    });

    // Load the state
    const loadedState = windowStateManager.loadState();

    // Verify the state is preserved (negative coordinates are valid)
    expect(loadedState).toEqual(stateWithNegativeCoords);
    expect(loadedState.x).toBe(-1920);
  });

  /* Preconditions: state with boundary coordinates
     Action: save state then load state
     Assertions: boundary coordinates are preserved correctly
     Requirements: ui.5.4 */
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

    // Save the state
    windowStateManager.saveState(boundaryState);

    // Mock loadData to return the saved state
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: JSON.stringify(boundaryState),
    });

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
     Requirements: ui.5.4 */
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

    // Save the state
    windowStateManager.saveState(maxState);

    // Mock loadData to return the saved state
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: JSON.stringify(maxState),
    });

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
     Requirements: ui.5.4 */
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

    // First cycle: save and load
    windowStateManager.saveState(originalState);
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: JSON.stringify(originalState),
    });
    const loadedState1 = windowStateManager.loadState();
    expect(loadedState1).toEqual(originalState);

    // Second cycle: save the loaded state and load again
    windowStateManager.saveState(loadedState1);
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: JSON.stringify(loadedState1),
    });
    const loadedState2 = windowStateManager.loadState();
    expect(loadedState2).toEqual(originalState);

    // Third cycle: verify consistency
    windowStateManager.saveState(loadedState2);
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: JSON.stringify(loadedState2),
    });
    const loadedState3 = windowStateManager.loadState();
    expect(loadedState3).toEqual(originalState);
  });

  /* Preconditions: state with isMaximized true and false
     Action: save and load both states
     Assertions: isMaximized flag is preserved correctly
     Requirements: ui.5.4 */
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

    // Test maximized state
    windowStateManager.saveState(maximizedState);
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: JSON.stringify(maximizedState),
    });
    const loadedMaximized = windowStateManager.loadState();
    expect(loadedMaximized.isMaximized).toBe(true);

    // Test normal state
    windowStateManager.saveState(normalState);
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: JSON.stringify(normalState),
    });
    const loadedNormal = windowStateManager.loadState();
    expect(loadedNormal.isMaximized).toBe(false);
  });

  /* Preconditions: corrupted JSON data in storage
     Action: attempt to load corrupted state
     Assertions: returns default state gracefully
     Requirements: ui.5.4, ui.5.5 */
  // Feature: ui, Property 7
  test('Property 7 edge case: corrupted data returns default state', () => {
    // Mock corrupted JSON
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: '{invalid json}',
    });

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    });

    // Load state
    const loadedState = windowStateManager.loadState();

    // Verify default state is returned
    expect(loadedState.isMaximized).toBe(false);
    expect(loadedState.width).toBe(1920);
    expect(loadedState.height).toBe(1080);
  });

  /* Preconditions: empty data in storage
     Action: attempt to load empty state
     Assertions: returns default state
     Requirements: ui.5.4, ui.5.5 */
  // Feature: ui, Property 7
  test('Property 7 edge case: empty data returns default state', () => {
    // Mock empty data
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: '',
    });

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    });

    // Load state
    const loadedState = windowStateManager.loadState();

    // Verify default state is returned
    expect(loadedState.isMaximized).toBe(false);
    expect(loadedState.width).toBe(1920);
    expect(loadedState.height).toBe(1080);
  });

  /* Preconditions: loadData returns success: false
     Action: attempt to load state
     Assertions: returns default state
     Requirements: ui.5.4, ui.5.5 */
  // Feature: ui, Property 7
  test('Property 7 edge case: failed load returns default state', () => {
    // Mock failed load
    mockDataManager.loadData.mockReturnValue({
      success: false,
    });

    mockScreen.getPrimaryDisplay.mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    });

    // Load state
    const loadedState = windowStateManager.loadState();

    // Verify default state is returned
    expect(loadedState.isMaximized).toBe(false);
    expect(loadedState.width).toBe(1920);
    expect(loadedState.height).toBe(1080);
  });
});

// Additional tests for WindowManager integration with state changes
describe('Property Tests - WindowManager State Changes', () => {
  let mockDataManager: jest.Mocked<DataManager>;
  let mockScreen: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock DataManager
    mockDataManager = {
      loadData: jest.fn().mockReturnValue({ success: false }),
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
        bounds: { x: 0, y: 0, width: 3000, height: 2500 },
      },
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* Preconditions: window created with various initial states
     Action: trigger resize/move/maximize events
     Assertions: DataManager.saveData called with updated state
     Requirements: ui.5.1, ui.5.2, ui.5.3 */
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
          mockDataManager.saveData.mockClear();

          // Create WindowManager instance
          const windowManager = new WindowManager(mockDataManager);

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

          // Clear saveData calls from window creation
          mockDataManager.saveData.mockClear();

          // Trigger resize event
          if (resizeHandler) {
            resizeHandler();
          }

          // Verify saveData was called with the new state
          expect(mockDataManager.saveData).toHaveBeenCalled();
          const saveCall = mockDataManager.saveData.mock.calls[0];
          expect(saveCall[0]).toBe('window_state');

          const savedState = JSON.parse(saveCall[1] as string);
          expect(savedState.x).toBe(newState.x);
          expect(savedState.y).toBe(newState.y);
          expect(savedState.width).toBe(newState.width);
          expect(savedState.height).toBe(newState.height);
          expect(savedState.isMaximized).toBe(newState.isMaximized);

          // Clear for next event
          mockDataManager.saveData.mockClear();

          // Trigger move event
          if (moveHandler) {
            moveHandler();
          }

          // Verify saveData was called again
          expect(mockDataManager.saveData).toHaveBeenCalled();
          const moveCall = mockDataManager.saveData.mock.calls[0];
          expect(moveCall[0]).toBe('window_state');

          const movedState = JSON.parse(moveCall[1] as string);
          expect(movedState.x).toBe(newState.x);
          expect(movedState.y).toBe(newState.y);

          // Clear for next event
          mockDataManager.saveData.mockClear();

          // Trigger maximize event if applicable
          if (maximizeHandler && newState.isMaximized) {
            maximizeHandler();

            // Verify saveData was called
            expect(mockDataManager.saveData).toHaveBeenCalled();
            const maxCall = mockDataManager.saveData.mock.calls[0];
            expect(maxCall[0]).toBe('window_state');

            const maxState = JSON.parse(maxCall[1] as string);
            expect(maxState.isMaximized).toBe(true);
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
     Assertions: saveData called with updated bounds
     Requirements: ui.5.1 */
  // Feature: ui, Property 6
  test('Property 6 edge case: resize event saves updated bounds', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    const windowManager = new WindowManager(mockDataManager);
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

    // Clear previous calls
    mockDataManager.saveData.mockClear();

    // Trigger resize
    if (resizeHandler) {
      resizeHandler();
    }

    // Verify save was called
    expect(mockDataManager.saveData).toHaveBeenCalledWith(
      'window_state',
      expect.stringContaining('"width":1400')
    );
    expect(mockDataManager.saveData).toHaveBeenCalledWith(
      'window_state',
      expect.stringContaining('"height":900')
    );

    windowManager.closeWindow();
  });

  /* Preconditions: window created, position changes
     Action: trigger move event
     Assertions: saveData called with updated position
     Requirements: ui.5.2 */
  // Feature: ui, Property 6
  test('Property 6 edge case: move event saves updated position', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    const windowManager = new WindowManager(mockDataManager);
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

    // Clear previous calls
    mockDataManager.saveData.mockClear();

    // Trigger move
    if (moveHandler) {
      moveHandler();
    }

    // Verify save was called
    expect(mockDataManager.saveData).toHaveBeenCalledWith(
      'window_state',
      expect.stringContaining('"x":250')
    );
    expect(mockDataManager.saveData).toHaveBeenCalledWith(
      'window_state',
      expect.stringContaining('"y":300')
    );

    windowManager.closeWindow();
  });

  /* Preconditions: window created, window maximized
     Action: trigger maximize event
     Assertions: saveData called with isMaximized: true
     Requirements: ui.5.3 */
  // Feature: ui, Property 6
  test('Property 6 edge case: maximize event saves maximized state', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    const windowManager = new WindowManager(mockDataManager);
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

    // Clear previous calls
    mockDataManager.saveData.mockClear();

    // Trigger maximize
    if (maximizeHandler) {
      maximizeHandler();
    }

    // Verify save was called with isMaximized: true
    expect(mockDataManager.saveData).toHaveBeenCalledWith(
      'window_state',
      expect.stringContaining('"isMaximized":true')
    );

    windowManager.closeWindow();
  });

  /* Preconditions: window created and maximized, window unmaximized
     Action: trigger unmaximize event
     Assertions: saveData called with isMaximized: false
     Requirements: ui.5.3 */
  // Feature: ui, Property 6
  test('Property 6 edge case: unmaximize event saves normal state', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    const windowManager = new WindowManager(mockDataManager);
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

    // Clear previous calls
    mockDataManager.saveData.mockClear();

    // Trigger unmaximize
    if (unmaximizeHandler) {
      unmaximizeHandler();
    }

    // Verify save was called with isMaximized: false
    expect(mockDataManager.saveData).toHaveBeenCalledWith(
      'window_state',
      expect.stringContaining('"isMaximized":false')
    );

    windowManager.closeWindow();
  });

  /* Preconditions: window created, multiple state changes occur
     Action: trigger multiple events in sequence
     Assertions: saveData called for each event with correct state
     Requirements: ui.5.1, ui.5.2, ui.5.3 */
  // Feature: ui, Property 6
  test('Property 6 edge case: multiple state changes save correctly', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    const windowManager = new WindowManager(mockDataManager);
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

    // Clear previous calls
    mockDataManager.saveData.mockClear();

    // First change: resize
    mockWindow.getBounds.mockReturnValue({ x: 100, y: 100, width: 1400, height: 900 });
    mockWindow.isMaximized.mockReturnValue(false);
    if (resizeHandler) resizeHandler();
    expect(mockDataManager.saveData).toHaveBeenCalledTimes(1);

    // Second change: move
    mockWindow.getBounds.mockReturnValue({ x: 200, y: 150, width: 1400, height: 900 });
    if (moveHandler) moveHandler();
    expect(mockDataManager.saveData).toHaveBeenCalledTimes(2);

    // Third change: maximize
    mockWindow.isMaximized.mockReturnValue(true);
    if (maximizeHandler) maximizeHandler();
    expect(mockDataManager.saveData).toHaveBeenCalledTimes(3);

    windowManager.closeWindow();
  });

  /* Preconditions: window created, window closed
     Action: trigger close event
     Assertions: saveData called with final state
     Requirements: ui.5.1, ui.5.2, ui.5.3 */
  // Feature: ui, Property 6
  test('Property 6 edge case: close event saves final state', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WindowManager = require('../../src/main/WindowManager').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron');

    const windowManager = new WindowManager(mockDataManager);
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

    // Clear previous calls
    mockDataManager.saveData.mockClear();

    // Trigger close
    if (closeHandler) {
      closeHandler();
    }

    // Verify save was called with final state
    expect(mockDataManager.saveData).toHaveBeenCalled();
    const saveCall = mockDataManager.saveData.mock.calls[0];
    const savedState = JSON.parse(saveCall[1] as string);
    expect(savedState.x).toBe(300);
    expect(savedState.y).toBe(200);
    expect(savedState.width).toBe(1600);
    expect(savedState.height).toBe(1000);
    expect(savedState.isMaximized).toBe(true);

    windowManager.closeWindow();
  });
});
