// Requirements: clerkly.2, clerkly.nfr.1

import { LifecycleManager } from '../../src/main/LifecycleManager';
import WindowManager from '../../src/main/WindowManager';
import { DataManager } from '../../src/main/DataManager';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

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
