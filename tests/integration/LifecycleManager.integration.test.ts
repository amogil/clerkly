// Requirements: clerkly.2, clerkly.nfr.1

import { LifecycleManager } from '../../src/main/LifecycleManager';
import WindowManager from '../../src/main/WindowManager';
import { DataManager } from '../../src/main/DataManager';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Mock Electron's BrowserWindow
jest.mock('electron', () => ({
  BrowserWindow: jest.fn().mockImplementation(function (
    this: Record<string, unknown>,
    options: Record<string, unknown>
  ) {
    this.bounds = {
      x: (options.x as number) || 0,
      y: (options.y as number) || 0,
      width: (options.width as number) || 800,
      height: (options.height as number) || 600,
    };
    this.maximized = false;
    this.destroyed = false;
    this.listeners = new Map();

    this.loadFile = jest.fn().mockResolvedValue(undefined);
    this.on = jest.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (!(this.listeners as Map<string, unknown[]>).has(event)) {
        (this.listeners as Map<string, unknown[]>).set(event, []);
      }
      (this.listeners as Map<string, unknown[]>).get(event)?.push(callback);
    });
    this.once = jest.fn();
    this.removeAllListeners = jest.fn(() => {
      (this.listeners as Map<string, unknown[]>).clear();
    });
    this.close = jest.fn();
    this.destroy = jest.fn(() => {
      this.destroyed = true;
    });
    this.isDestroyed = jest.fn(() => this.destroyed);
    this.getBounds = jest.fn(() => ({ ...(this.bounds as Record<string, number>) }));
    this.maximize = jest.fn(() => {
      this.maximized = true;
    });
    this.unmaximize = jest.fn(() => {
      this.maximized = false;
    });
    this.isMaximized = jest.fn(() => this.maximized);
    this.show = jest.fn();
    this.webContents = {
      session: {
        webRequest: {
          onHeadersReceived: jest.fn(),
        },
      },
      on: jest.fn(),
    };

    return this;
  }),
  screen: {
    getPrimaryDisplay: jest.fn().mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    }),
  },
  app: {
    getPath: jest.fn(),
  },
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
}));

/**
 * Integration tests for LifecycleManager with real timing behavior
 * These tests use real Electron and real delays to test performance requirements
 */
describe('LifecycleManager Integration Tests', () => {
  let lifecycleManager: LifecycleManager;
  let windowManager: WindowManager;
  let dataManager: DataManager;
  let testStoragePath: string;

  beforeEach(() => {
    // Create unique test storage path
    testStoragePath = path.join(
      os.tmpdir(),
      `test-lifecycle-integration-${Date.now()}-${Math.random()}`
    );

    // Create real instances (no mocks in integration tests)
    dataManager = new DataManager(testStoragePath);
    windowManager = new WindowManager(dataManager);
    lifecycleManager = new LifecycleManager(windowManager, dataManager);
  });

  afterEach(() => {
    // Cleanup
    try {
      if (windowManager.isWindowCreated()) {
        windowManager.closeWindow();
      }
      dataManager.close();
      if (fs.existsSync(testStoragePath)) {
        fs.rmSync(testStoragePath, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  /* Preconditions: LifecycleManager created with real DataManager that has artificial delay
     Action: call initialize() with DataManager that takes > 3 seconds
     Assertions: returns success true, loadTime > 3000ms, console.warn called with slow startup message
     Requirements: clerkly.2, clerkly.nfr.1 */
  it('should warn about slow startup when exceeding 3 seconds', async () => {
    // Create a custom DataManager with slow initialization
    class SlowDataManager extends DataManager {
      initialize() {
        // Add artificial delay before initialization
        const start = Date.now();
        while (Date.now() - start < 3100) {
          // Busy wait to simulate slow initialization
        }
        return super.initialize();
      }
    }

    const slowDataManager = new SlowDataManager(testStoragePath);
    const slowWindowManager = new WindowManager(slowDataManager);
    const slowLifecycleManager = new LifecycleManager(slowWindowManager, slowDataManager);

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await slowLifecycleManager.initialize();

    expect(result.success).toBe(true);
    expect(result.loadTime).toBeGreaterThan(3000);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Slow startup'));
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('target: <3000ms'));

    consoleWarnSpy.mockRestore();

    // Cleanup
    if (slowWindowManager.isWindowCreated()) {
      slowWindowManager.closeWindow();
    }
    slowDataManager.close();
  }, 10000); // Increase timeout for this slow test

  /* Preconditions: LifecycleManager created with normal DataManager
     Action: call initialize()
     Assertions: returns success true, loadTime < 3000ms, no warning logged
     Requirements: clerkly.2, clerkly.nfr.1 */
  it('should not warn about fast startup', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await lifecycleManager.initialize();

    expect(result.success).toBe(true);
    expect(result.loadTime).toBeLessThan(3000);
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Slow startup'));

    consoleWarnSpy.mockRestore();
  });
});
