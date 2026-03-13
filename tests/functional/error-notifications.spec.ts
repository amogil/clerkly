/* Preconditions: Application running with ErrorNotificationManager
   Action: Trigger background process error, wait for notification display
   Assertions: Error notification appears with message and context, auto-dismisses after timeout
   Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3, error-notifications.1.4 */

import { test, expect } from '@playwright/test';
import { launchElectron, closeElectron, ElectronTestContext } from './helpers/electron';

let context: ElectronTestContext;

test.beforeEach(async () => {
  // Launch Electron app with clean state
  context = await launchElectron();
  await context.window.waitForLoadState('domcontentloaded');
  await context.window.waitForSelector('[data-testid="login-screen"], [data-testid="agents"]', {
    timeout: 10000,
  });
});

test.afterEach(async () => {
  if (context) {
    await closeElectron(context, true, false);
  }
});

/* Preconditions: Application running, background process can fail
   Action: Trigger error in background process (e.g., fetchProfile)
   Assertions: Toast notification displayed with message and context
   Requirements: error-notifications.1.1, error-notifications.1.2
   Property: 20, 21 */
test('should show error notification on background process failure', async () => {
  // Wait for App to fully initialize (already done in beforeEach)

  // Trigger error notification via IPC handler
  await context.window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('test:trigger-error-notification', {
      message: 'Failed to load user profile',
      context: 'Profile Loading',
    });
  });

  // Wait for toast notification to appear (sonner uses [data-sonner-toast] attribute)
  const toast = context.window.locator('[data-sonner-toast]');
  await expect(toast).toBeVisible({ timeout: 10000 });

  // Check that toast contains the context and message separately
  const contextElement = toast.locator('[data-notification-context]');
  const messageElement = toast.locator('[data-notification-message]');

  await expect(contextElement).toContainText('Profile Loading');
  await expect(messageElement).toContainText('Failed to load user profile');
});

/* Preconditions: Error notification displayed
   Action: Wait for auto-dismiss timeout
   Assertions: Notification automatically dismissed
   Requirements: error-notifications.1.3
   Property: 22 */
test('should auto-dismiss error notification after timeout', async () => {
  // Show a notification via IPC
  await context.window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('test:trigger-error-notification', {
      message: 'Test auto-dismiss',
      context: 'Test Context',
    });
  });

  // Wait for toast notification to appear
  const toast = context.window.locator('[data-sonner-toast]');
  await expect(toast).toBeVisible({ timeout: 5000 });

  // Wait for auto-dismiss (15 seconds as per error-notifications.1.3 requirement)
  await context.window.waitForTimeout(16000);

  // Check that notification is gone
  await expect(toast).not.toBeVisible();
});

/* Preconditions: Error notification displayed
   Action: Click on notification close button
   Assertions: Notification dismissed immediately
   Requirements: error-notifications.1.3
   Property: 22 */
test('should dismiss notification on click', async () => {
  // Show a notification via IPC
  await context.window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('test:trigger-error-notification', {
      message: 'Test manual dismiss',
      context: 'Test Context',
    });
  });

  // Wait for toast notification to appear
  const toast = context.window.locator('[data-sonner-toast]');
  await expect(toast).toBeVisible({ timeout: 10000 });

  // Click the close button (sonner uses [data-close-button] attribute)
  const closeButton = toast.locator('[data-close-button]');
  await closeButton.click();

  // Check that notification is gone immediately
  await expect(toast).not.toBeVisible({ timeout: 1000 });
});

/* Preconditions: Application running with console access
   Action: Trigger background process error
   Assertions: Error logged to console with context and message
   Requirements: error-notifications.1.4
   Property: 23 */
test('should log errors to console', async () => {
  // Collect main process logs (AuthIPCHandlers logger writes in Electron main process).
  const processLogs: string[] = [];
  const electronProcess = context.app.process();
  const collectLogs = (chunk: Buffer | string) => {
    processLogs.push(chunk.toString());
  };
  electronProcess?.stdout?.on('data', collectLogs);
  electronProcess?.stderr?.on('data', collectLogs);

  try {
    // Trigger an error via IPC
    await context.window.evaluate(async () => {
      await (window as any).electron.ipcRenderer.invoke('test:trigger-error-notification', {
        message: 'Test error logging',
        context: 'Test Context',
      });
    });

    await expect
      .poll(() => processLogs.join('\n'), { timeout: 5000 })
      .toContain('[AuthIPCHandlers] [Test Context] Error: Test error logging');
  } finally {
    electronProcess?.stdout?.off('data', collectLogs);
    electronProcess?.stderr?.off('data', collectLogs);
  }
});
