/* Preconditions: Application running with ErrorNotificationManager
   Action: Trigger background process error, wait for notification display
   Assertions: Error notification appears with message and context, auto-dismisses after 15 seconds
   Requirements: ui.7.1, ui.7.2, ui.7.3, ui.7.4 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  // Get the first window
  window = await electronApp.firstWindow();

  // Wait for app to be ready
  await window.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await electronApp.close();
});

/* Preconditions: Application running, background process can fail
   Action: Trigger error in background process (e.g., fetchProfile)
   Assertions: Notification displayed with message and context
   Requirements: ui.7.1, ui.7.2
   Property: 20, 21 */
test('should show error notification on background process failure', async () => {
  // Trigger an error by calling a function that will fail
  // We'll use the IPC mechanism to simulate a background error
  await window.evaluate(() => {
    // Simulate a background error notification
    const event = new CustomEvent('error:notify', {
      detail: {
        message: 'Failed to load user profile',
        context: 'Profile Loading',
      },
    });
    window.dispatchEvent(event);
  });

  // Wait for notification to appear
  const notification = window.locator('.notification-item');
  await expect(notification).toBeVisible({ timeout: 5000 });

  // Check that notification contains context
  const context = notification.locator('.notification-context');
  await expect(context).toHaveText('Profile Loading');

  // Check that notification contains message
  const message = notification.locator('.notification-message');
  await expect(message).toHaveText('Failed to load user profile');
});

/* Preconditions: Error notification displayed
   Action: Wait 15 seconds
   Assertions: Notification automatically dismissed
   Requirements: ui.7.3
   Property: 22 */
test('should auto-dismiss error notification after 15 seconds', async () => {
  // Show a notification
  await window.evaluate(() => {
    const event = new CustomEvent('error:notify', {
      detail: {
        message: 'Test auto-dismiss',
        context: 'Test Context',
      },
    });
    window.dispatchEvent(event);
  });

  // Wait for notification to appear
  const notification = window.locator('.notification-item');
  await expect(notification).toBeVisible({ timeout: 5000 });

  // Wait for auto-dismiss (15 seconds + buffer)
  await window.waitForTimeout(16000);

  // Check that notification is gone
  await expect(notification).not.toBeVisible();
});

/* Preconditions: Error notification displayed
   Action: Click on notification close button
   Assertions: Notification dismissed immediately
   Requirements: ui.7.3
   Property: 22 */
test('should dismiss notification on click', async () => {
  // Show a notification
  await window.evaluate(() => {
    const event = new CustomEvent('error:notify', {
      detail: {
        message: 'Test manual dismiss',
        context: 'Test Context',
      },
    });
    window.dispatchEvent(event);
  });

  // Wait for notification to appear
  const notification = window.locator('.notification-item');
  await expect(notification).toBeVisible({ timeout: 5000 });

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
  window.on('console', (msg) => {
    consoleMessages.push(msg.text());
  });

  // Trigger an error
  await window.evaluate(() => {
    const event = new CustomEvent('error:notify', {
      detail: {
        message: 'Test error logging',
        context: 'Test Context',
      },
    });
    window.dispatchEvent(event);
  });

  // Wait a bit for console log
  await window.waitForTimeout(1000);

  // Check that error was logged
  const hasErrorLog = consoleMessages.some(
    (msg) =>
      msg.includes('ErrorNotificationManager') &&
      msg.includes('Notification shown') &&
      msg.includes('Test error logging')
  );

  expect(hasErrorLog).toBe(true);
});
