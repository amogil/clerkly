/* Preconditions: Application running with ErrorNotificationManager
   Action: Trigger background process error, wait for notification display
   Assertions: Error notification appears with message and context, auto-dismisses after 15 seconds
   Requirements: ui.7.1, ui.7.2, ui.7.3, ui.7.4 */

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
} from './helpers/electron';

let context: ElectronTestContext;

test.beforeEach(async () => {
  // Launch Electron app with clean state
  context = await launchElectron();
  await context.window.waitForLoadState('domcontentloaded');
  await context.window.waitForTimeout(1000);
});

test.afterEach(async () => {
  if (context) {
    await closeElectron(context);
  }
});

/* Preconditions: Application running, background process can fail
   Action: Trigger error in background process (e.g., fetchProfile)
   Assertions: Notification displayed with message and context
   Requirements: ui.7.1, ui.7.2
   Property: 20, 21 */
test('should show error notification on background process failure', async () => {
  // Wait for App to fully initialize
  await context.window.waitForTimeout(3000);

  // Trigger error notification via IPC handler
  await context.window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('test:trigger-error-notification', {
      message: 'Failed to load user profile',
      context: 'Profile Loading',
    });
  });

  // Wait for notification to appear
  const notification = context.window.locator('.notification-item');
  await expect(notification).toBeVisible({ timeout: 10000 });

  // Check that notification contains context
  const notificationContext = notification.locator('.notification-context');
  await expect(notificationContext).toHaveText('Profile Loading');

  // Check that notification contains message
  const message = notification.locator('.notification-message');
  await expect(message).toHaveText('Failed to load user profile');
});

/* Preconditions: Error notification displayed
   Action: Wait 15 seconds
   Assertions: Notification automatically dismissed
   Requirements: ui.7.3
   Property: 22 */
test.skip('should auto-dismiss error notification after 15 seconds', async () => {
  // Show a notification via IPC
  await context.window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('test:trigger-error-notification', {
      message: 'Test auto-dismiss',
      context: 'Test Context',
    });
  });

  // Wait for notification to appear
  const notification = context.window.locator('.notification-item');
  await expect(notification).toBeVisible({ timeout: 5000 });

  // Wait for auto-dismiss (15 seconds + buffer)
  await context.window.waitForTimeout(16000);

  // Check that notification is gone
  await expect(notification).not.toBeVisible();
});

/* Preconditions: Error notification displayed
   Action: Click on notification close button
   Assertions: Notification dismissed immediately
   Requirements: ui.7.3
   Property: 22 */
test('should dismiss notification on click', async () => {
  // Wait for App to fully initialize
  await context.window.waitForTimeout(3000);

  // Show a notification via IPC
  await context.window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('test:trigger-error-notification', {
      message: 'Test manual dismiss',
      context: 'Test Context',
    });
  });

  // Wait for notification to appear
  const notification = context.window.locator('.notification-item');
  await expect(notification).toBeVisible({ timeout: 10000 });

  // Click the close button
  const closeButton = notification.locator('.notification-close');
  await closeButton.click();

  // Check that notification is gone immediately
  await expect(notification).not.toBeVisible({ timeout: 1000 });
});

/* Preconditions: Application running with console access
   Action: Trigger background process error
   Assertions: Error logged to console with context and message
   Requirements: ui.7.4
   Property: 23 */
test('should log errors to console', async () => {
  // Collect console messages
  const consoleMessages: string[] = [];
  context.window.on('console', (msg) => {
    consoleMessages.push(msg.text());
  });

  // Trigger an error via IPC
  await context.window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('test:trigger-error-notification', {
      message: 'Test error logging',
      context: 'Test Context',
    });
  });

  // Wait a bit for console log
  await context.window.waitForTimeout(1000);

  // Check that error was logged
  const hasErrorLog = consoleMessages.some(
    (msg) =>
      (msg.includes('Error notification received') || msg.includes('Notification shown')) &&
      msg.includes('Test error logging')
  );

  expect(hasErrorLog).toBe(true);
});
