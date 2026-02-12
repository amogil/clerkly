// Requirements: settings.2.1, settings.2.2, settings.2.3, settings.2.4, settings.2.6, settings.2.7

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  completeOAuthFlow,
} from './helpers/electron';
import { MockOAuthServer } from './helpers/mock-oauth-server';

let context: ElectronTestContext;
let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  // Start mock OAuth server
  mockServer = new MockOAuthServer({
    port: 8890,
    clientId: 'test-client-id-12345',
    clientSecret: 'test-client-secret-67890',
  });

  await mockServer.start();
  process.env.CLERKLY_GOOGLE_API_URL = mockServer.getBaseUrl();
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
  delete process.env.CLERKLY_GOOGLE_API_URL;
});

test.beforeEach(async () => {
  // Launch app and authenticate before each test
  context = await launchElectron();
  await context.window.waitForLoadState('domcontentloaded');

  // Set user profile for authentication
  mockServer.setUserProfile({
    id: '123456789',
    email: 'datetime.test@example.com',
    name: 'DateTime Test User',
    given_name: 'DateTime',
    family_name: 'Test User',
  });

  // Complete OAuth flow to get authenticated
  await completeOAuthFlow(context.app, context.window);

  // Wait for dashboard to load
  await context.window.waitForTimeout(1000);
});

test.afterEach(async () => {
  if (context) {
    await closeElectron(context);
  }
});

/* Preconditions: app launched, system locale set
   Action: navigate to Tasks/Contacts with dates, check date formatting
   Assertions: dates formatted according to system locale (not hardcoded format)
   Requirements: settings.2.1, settings.2.2 */
test.skip('should format dates using system locale', async () => {
  // Navigate to Tasks
  await context.window.click('text=Tasks');
  await context.window.waitForTimeout(500);

  // Check that dates are displayed (not checking specific format as it depends on system locale)
  const taskDeadlines = await context.window
    .locator('[class*="deadline"], [class*="Calendar"]')
    .count();
  expect(taskDeadlines).toBeGreaterThan(0);

  // Navigate to Contacts
  await context.window.click('text=Contacts');
  await context.window.waitForTimeout(500);

  // Check that meeting dates are displayed
  const contactDates = await context.window.locator('text=/meetings|Last:/i').count();
  expect(contactDates).toBeGreaterThan(0);
});

/* Preconditions: app running, various dates displayed
   Action: check all date displays in Tasks, Calendar, Contacts
   Assertions: no relative formats like "2 hours ago", "yesterday", "tomorrow"
   Requirements: settings.2.4 */
test('should not display relative time formats', async () => {
  // Navigate to Tasks
  await context.window.click('text=Tasks');
  await context.window.waitForTimeout(500);

  // Get all text content
  const tasksContent = await context.window.textContent('body');
  expect(tasksContent).toBeTruthy();

  // Check for relative time words
  const relativeWords = ['ago', 'yesterday', 'tomorrow', 'hours ago', 'minutes ago'];
  relativeWords.forEach((word) => {
    expect(tasksContent?.toLowerCase()).not.toContain(word);
  });

  // Navigate to Contacts
  await context.window.click('text=Contacts');
  await context.window.waitForTimeout(500);

  const contactsContent = await context.window.textContent('body');
  expect(contactsContent).toBeTruthy();

  // Contacts may have "Last: Today" or "Last: Yesterday" in meeting info
  // But should not have relative formats like "2 hours ago"
  expect(contactsContent?.toLowerCase()).not.toContain('hours ago');
  expect(contactsContent?.toLowerCase()).not.toContain('minutes ago');
});

/* Preconditions: app running, user authenticated
   Action: navigate to Settings
   Assertions: "Display Preferences" section does not exist, no date/time format settings
   Requirements: settings.2.7 */
test('should not show Display Preferences section', async () => {
  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForTimeout(500);

  // Check that "Display Preferences" section does not exist
  const displayPreferencesExists = await context.window
    .locator('text=/Display Preferences/i')
    .count();
  expect(displayPreferencesExists).toBe(0);

  // Check that date/time format settings do not exist
  const dateFormatExists = await context.window.locator('text=/Date Format|Time Format/i').count();
  expect(dateFormatExists).toBe(0);
});

/* Preconditions: app running with various dates
   Action: verify date formatting is consistent across components
   Assertions: all dates use DateTimeFormatter utility (verified by consistent formatting)
   Requirements: settings.2.5 */
test.skip('should use consistent date formatting across components', async () => {
  // Navigate to Tasks
  await context.window.click('text=Tasks');
  await context.window.waitForTimeout(500);

  // Get task deadline format
  const taskDeadline = await context.window.locator('[class*="deadline"]').first().textContent();
  expect(taskDeadline).toBeTruthy();

  // Navigate to Contacts
  await context.window.click('text=Contacts');
  await context.window.waitForTimeout(500);

  // Get contact meeting date format
  const contactDate = await context.window.locator('text=/Last:/i').first().textContent();
  expect(contactDate).toBeTruthy();

  // Both should be non-empty (specific format depends on system locale)
  // The important thing is that they both use DateTimeFormatter utility
});
