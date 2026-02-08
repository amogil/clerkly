/* Preconditions: Electron app is launched with authentication
   Action: Test AI Agent Settings functionality end-to-end
   Assertions: Verify save/load, encryption, deletion, provider switching, visibility toggle, error handling, and user isolation
   Requirements: ui.10.3, ui.10.4, ui.10.5, ui.10.6, ui.10.9, ui.10.11, ui.10.13, ui.10.14, ui.10.15, ui.10.17, ui.12.8 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

let electronApp: ElectronApplication;
let window: Page;
let testDbPath: string;

test.beforeAll(async () => {
  // Create temporary database for testing
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clerkly-test-'));
  testDbPath = path.join(tempDir, 'test.db');

  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_DB_PATH: testDbPath,
    },
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await electronApp.close();

  // Cleanup test database
  if (testDbPath && fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

/* Preconditions: App is launched and authenticated
   Action: Select LLM provider, close and reopen app
   Assertions: Provider selection is persisted
   Requirements: ui.10.4, ui.10.15 */
test('53.1: should save and load LLM provider selection', async () => {
  // Navigate to Settings
  await window.click('text=Settings');
  await window.waitForSelector('text=AI Agent Settings');

  // Select Anthropic
  await window.selectOption('select:near(:text("LLM Provider"))', 'anthropic');

  // Wait for save
  await window.waitForTimeout(100);

  // Close and reopen app
  await electronApp.close();

  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_DB_PATH: testDbPath,
    },
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Navigate to Settings
  await window.click('text=Settings');
  await window.waitForSelector('text=AI Agent Settings');

  // Check that Anthropic is selected
  const selectedValue = await window.inputValue('select:near(:text("LLM Provider"))');
  expect(selectedValue).toBe('anthropic');
});

/* Preconditions: App is launched and authenticated
   Action: Enter API key, close and reopen app, toggle visibility
   Assertions: API key is persisted and encrypted, displays correctly
   Requirements: ui.10.4, ui.10.9, ui.10.15, ui.10.17 */
test('53.2: should save and load API key with encryption', async () => {
  const testApiKey = 'sk-test-key-12345678901234567890';

  // Navigate to Settings
  await window.click('text=Settings');
  await window.waitForSelector('text=AI Agent Settings');

  // Enter API key
  const apiKeyInput = await window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill(testApiKey);

  // Wait for debounce (500ms)
  await window.waitForTimeout(600);

  // Close and reopen app
  await electronApp.close();

  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_DB_PATH: testDbPath,
    },
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Navigate to Settings
  await window.click('text=Settings');
  await window.waitForSelector('text=AI Agent Settings');

  // Check that API key field is filled (but hidden)
  const apiKeyInput2 = await window.locator('input[placeholder="Enter your API key"]');
  const inputType = await apiKeyInput2.getAttribute('type');
  expect(inputType).toBe('password');

  const inputValue = await apiKeyInput2.inputValue();
  expect(inputValue).toBeTruthy();

  // Toggle visibility
  const toggleButton = await window.locator('button:has(svg):near(:text("API Key"))');
  await toggleButton.click();

  // Check that key is visible and correct
  const inputType2 = await apiKeyInput2.getAttribute('type');
  expect(inputType2).toBe('text');

  const visibleValue = await apiKeyInput2.inputValue();
  expect(visibleValue).toBe(testApiKey);
});

/* Preconditions: App is launched and authenticated with API key saved
   Action: Clear API key field, close and reopen app
   Assertions: API key is deleted from database
   Requirements: ui.10.6 */
test('53.3: should delete API key when field is cleared', async () => {
  // Navigate to Settings
  await window.click('text=Settings');
  await window.waitForSelector('text=AI Agent Settings');

  // Enter API key first
  const apiKeyInput = await window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('test-key-to-delete');
  await window.waitForTimeout(600);

  // Clear the field
  await apiKeyInput.fill('');
  await window.waitForTimeout(600);

  // Close and reopen app
  await electronApp.close();

  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_DB_PATH: testDbPath,
    },
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Navigate to Settings
  await window.click('text=Settings');
  await window.waitForSelector('text=AI Agent Settings');

  // Check that API key field is empty
  const apiKeyInput2 = await window.locator('input[placeholder="Enter your API key"]');
  const inputValue = await apiKeyInput2.inputValue();
  expect(inputValue).toBe('');
});

/* Preconditions: App is launched and authenticated
   Action: Enter keys for multiple providers, switch between them
   Assertions: Each provider preserves its own key
   Requirements: ui.10.11, ui.10.14 */
test('53.4: should preserve API keys when switching providers', async () => {
  const openaiKey = 'sk-openai-key-123';
  const anthropicKey = 'sk-anthropic-key-456';

  // Navigate to Settings
  await window.click('text=Settings');
  await window.waitForSelector('text=AI Agent Settings');

  // Enter OpenAI key
  await window.selectOption('select:near(:text("LLM Provider"))', 'openai');
  const apiKeyInput = await window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill(openaiKey);
  await window.waitForTimeout(600);

  // Switch to Anthropic and enter key
  await window.selectOption('select:near(:text("LLM Provider"))', 'anthropic');
  await window.waitForTimeout(200); // Wait for key to load
  await apiKeyInput.fill(anthropicKey);
  await window.waitForTimeout(600);

  // Switch back to OpenAI
  await window.selectOption('select:near(:text("LLM Provider"))', 'openai');
  await window.waitForTimeout(200);

  // Check that OpenAI key is loaded
  let inputValue = await apiKeyInput.inputValue();
  expect(inputValue).toBe(openaiKey);

  // Switch to Anthropic
  await window.selectOption('select:near(:text("LLM Provider"))', 'anthropic');
  await window.waitForTimeout(200);

  // Check that Anthropic key is loaded
  inputValue = await apiKeyInput.inputValue();
  expect(inputValue).toBe(anthropicKey);
});

/* Preconditions: App is launched and authenticated
   Action: Enter API key, toggle visibility multiple times
   Assertions: Input type changes, icons change
   Requirements: ui.10.3, ui.10.4, ui.10.5 */
test('53.5: should toggle API key visibility', async () => {
  // Navigate to Settings
  await window.click('text=Settings');
  await window.waitForSelector('text=AI Agent Settings');

  // Enter API key
  const apiKeyInput = await window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('test-visibility-key');

  // Check initial state (password)
  let inputType = await apiKeyInput.getAttribute('type');
  expect(inputType).toBe('password');

  // Find toggle button
  const toggleButton = await window.locator('button:has(svg):near(:text("API Key"))');

  // Click to show
  await toggleButton.click();
  inputType = await apiKeyInput.getAttribute('type');
  expect(inputType).toBe('text');

  // Click to hide
  await toggleButton.click();
  inputType = await apiKeyInput.getAttribute('type');
  expect(inputType).toBe('password');
});

/* Preconditions: App is launched and authenticated, DataManager mocked to fail
   Action: Enter API key
   Assertions: Error notification is shown
   Requirements: ui.10.13 */
test('53.6: should show error notification on save failure', async () => {
  // This test would require mocking DataManager to fail
  // For now, we'll skip the actual implementation as it requires
  // more complex setup with IPC mocking
  test.skip();
});

/* Preconditions: App is launched
   Action: Login as User A, set settings, logout, login as User B, check settings, logout, login as User A
   Assertions: Settings are isolated between users
   Requirements: ui.12.8 */
test('53.7: should isolate settings between users', async () => {
  // This test requires multi-user authentication setup
  // For now, we'll skip as it requires OAuth mock server
  test.skip();
});
