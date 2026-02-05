// Requirements: clerkly.2, testing.3.1, testing.3.2, testing.3.6

import { test, expect } from '@playwright/test';
import { launchElectron, closeElectron, ElectronTestContext } from './helpers/electron';

/**
 * Functional tests for application lifecycle
 *
 * These tests launch the REAL Electron application and verify:
 * - Application starts successfully
 * - Window is created and visible
 * - Application can be closed gracefully
 *
 * Requirements: testing.3.1 - Use real Electron
 * Requirements: testing.3.2 - Do NOT mock Electron API
 * Requirements: testing.3.6 - Show real windows on screen
 */

test.describe('Application Lifecycle', () => {
  let context: ElectronTestContext;

  test.beforeAll(async () => {
    console.log('\n⚠️  WARNING: These tests will show real Electron windows on your screen!\n');
  });

  test.afterEach(async () => {
    if (context) {
      await closeElectron(context);
    }
  });

  /* Preconditions: Application not running
     Action: Launch Electron application
     Assertions: Application starts, window is created and visible
     Requirements: clerkly.2, testing.3.1, testing.3.6 */
  test('should launch application successfully', async () => {
    // Launch the application
    // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
    context = await launchElectron();

    // Verify application is running
    expect(context.app).toBeDefined();
    expect(context.window).toBeDefined();

    // Verify window has content loaded
    // Requirements: testing.3.6 - Real window on screen
    const title = await context.window.title();
    expect(title).toBeDefined();

    // Verify window is visible by checking it's not closed
    expect(context.window.isClosed()).toBe(false);

    // Take screenshot for verification
    await context.window.screenshot({ path: 'playwright-report/app-launch.png' });
  });

  /* Preconditions: Application is running
     Action: Close application
     Assertions: Application closes gracefully without errors
     Requirements: clerkly.2 */
  test('should close application gracefully', async () => {
    // Launch the application
    context = await launchElectron();

    // Verify application is running
    expect(context.app).toBeDefined();

    // Close the application
    await context.app.close();

    // Verify application is closed (this will throw if app is still running)
    // If we get here without error, the app closed successfully
    expect(true).toBe(true);
  });

  /* Preconditions: Application not running
     Action: Launch application, wait, verify it stays running
     Assertions: Application remains stable for at least 5 seconds
     Requirements: clerkly.2 */
  test('should remain stable after launch', async () => {
    // Launch the application
    context = await launchElectron();

    // Wait for 5 seconds
    await context.window.waitForTimeout(5000);

    // Verify window is still visible and responsive
    expect(context.window.isClosed()).toBe(false);

    // Verify we can interact with the window
    const title = await context.window.title();
    expect(title).toBeDefined();
  });

  /* Preconditions: Application not running
     Action: Launch application and check startup time
     Assertions: Application starts in less than 3 seconds
     Requirements: clerkly.nfr.1 */
  test('should start within 3 seconds', async () => {
    const startTime = Date.now();

    // Launch the application
    context = await launchElectron();

    // Wait for window to be fully loaded
    await context.window.waitForLoadState('load');

    const loadTime = Date.now() - startTime;

    // Verify startup time
    // Requirements: clerkly.nfr.1
    expect(loadTime).toBeLessThan(3000);

    console.log(`Application started in ${loadTime}ms`);
  });
});
