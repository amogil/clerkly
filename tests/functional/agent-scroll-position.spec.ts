/**
 * Functional Tests: Agent Scroll Position
 *
 * Tests for saving and restoring scroll position when switching between agents.
 * Requirements: agents.4.14
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { createMockOAuthServer, completeOAuthFlow, activeChat } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let electronApp: ElectronApplication;
let window: Page;
let mockOAuthServer: MockOAuthServer;

test.beforeAll(async () => {
  mockOAuthServer = await createMockOAuthServer();
});

test.afterAll(async () => {
  if (mockOAuthServer) {
    await mockOAuthServer.stop();
  }
});

test.beforeEach(async () => {
  mockOAuthServer.setUserProfile({
    id: 'test-scroll-user',
    email: 'scroll.test@example.com',
    name: 'Scroll Test User',
    given_name: 'Scroll',
    family_name: 'Test User',
  });

  // Create unique temp directory for this test
  const testDataPath = path.join(
    require('os').tmpdir(),
    `clerkly-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
  );

  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/main/index.js'), '--user-data-dir', testDataPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
      CLERKLY_OAUTH_CLIENT_ID: 'test-client-id-12345',
      CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
    },
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  await completeOAuthFlow(electronApp, window);
  await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 10000 });
});

test.afterEach(async () => {
  await electronApp.close();
});

test.describe('Agent Scroll Position', () => {
  /* Preconditions: Agent-1 with 15 messages and LLM responses, scrolled up; agent-2 empty
     Action: Scroll up in agent-1, switch to agent-2, return to agent-1
     Assertions: Scroll position in agent-1 is restored
     Requirements: agents.4.14.1, agents.4.14.2, agents.4.14.3 */
  test('should save and restore scroll position when switching agents', async () => {
    const messageInput = activeChat(window).textarea;
    const messagesArea = activeChat(window).messagesArea;
    const scrollToBottomBtn = window.locator('[data-testid="scroll-to-bottom"]');

    // Wait for first agent to be auto-created
    let agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });

    // Save first agent ID
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    // Send multiple messages to agent-1 to create scrollable content
    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Agent 1 Message ${i}`);
      await messageInput.press('Enter');
    }

    // Wait for all user messages to appear
    await expect(activeChat(window).userMessages).toHaveCount(15, { timeout: 10000 });

    // Wait for LLM response to the last message
    await expect(activeChat(window).llmMessages).toHaveCount(1, { timeout: 60000 });

    // Scroll up via real wheel event — use-stick-to-bottom tracks this correctly
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);

    // Verify user is NOT at bottom — scroll-to-bottom button should be visible
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Create new agent (agent-2) and switch to it
    const newChatButton = window.locator('div[title="New chat"]');
    await newChatButton.click();
    await expect(window.locator('[data-testid^="agent-icon-"]')).toHaveCount(2, { timeout: 5000 });

    // Re-create locator to get fresh list
    agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(2, { timeout: 5000 });

    // Switch back to agent-1 using its saved ID
    await window.locator(`[data-testid="agent-icon-${firstAgentId}"]`).click();

    // Wait for agent-1 messages to load
    await expect(activeChat(window).userMessages).toHaveCount(15, { timeout: 5000 });

    // Scroll position should be restored — scroll-to-bottom button still visible
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });
  });

  /* Preconditions: Agent with scrollable content
     Action: Scroll up, send new message
     Assertions: Scroll position resets to bottom (autoscroll)
     Requirements: agents.4.14.5 */
  test('should reset scroll position when user sends message', async () => {
    const messageInput = activeChat(window).textarea;
    const messagesArea = activeChat(window).messagesArea;
    const scrollToBottomBtn = window.locator('[data-testid="scroll-to-bottom"]');

    // Send multiple messages to create scrollable content
    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Message ${i}`);
      await messageInput.press('Enter');
    }

    await expect(activeChat(window).messages).toHaveCount(15, { timeout: 5000 });

    // Scroll up via real wheel event
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);

    // Verify scrolled up — scroll-to-bottom button visible
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Send new message — should trigger autoscroll to bottom
    await messageInput.fill('New message after scroll');
    await messageInput.press('Enter');

    // Wait for message to appear
    await expect(activeChat(window).messages).toHaveCount(16, { timeout: 5000 });

    // After sending, scroll-to-bottom button should disappear (back at bottom)
    await expect(scrollToBottomBtn).not.toBeVisible({ timeout: 5000 });
  });

  /* Preconditions: Three agents with different scroll positions
     Action: Switch between all three agents
     Assertions: Each agent maintains its own scroll position
     Requirements: agents.4.14.1, agents.4.14.2, agents.4.14.3 */
  test('should maintain independent scroll positions for multiple agents', async () => {
    const messageInput = activeChat(window).textarea;
    const messagesArea = activeChat(window).messagesArea;
    const newChatButton = window.locator('div[title="New chat"]');
    const scrollToBottomBtn = window.locator('[data-testid="scroll-to-bottom"]');

    // Wait for first agent to be auto-created
    let agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });

    // Save first agent ID
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    // Create agent-1 with messages and scroll up
    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Agent 1 Message ${i}`);
      await messageInput.press('Enter');
    }
    await expect(activeChat(window).userMessages).toHaveCount(15, { timeout: 10000 });
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Create agent-2 with messages and scroll up
    await newChatButton.click();

    agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(2, { timeout: 5000 });

    const allAgentIds1 = await agentIcons.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('data-testid')?.replace('agent-icon-', ''))
    );
    const secondAgentId = allAgentIds1.find((id) => id && id !== firstAgentId);
    expect(secondAgentId).toBeTruthy();

    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Agent 2 Message ${i}`);
      await messageInput.press('Enter');
    }
    await expect(activeChat(window).userMessages).toHaveCount(15, { timeout: 10000 });
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Create agent-3 with messages and scroll up
    await newChatButton.click();

    agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(3, { timeout: 5000 });

    const allAgentIds2 = await agentIcons.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('data-testid')?.replace('agent-icon-', ''))
    );
    const thirdAgentId = allAgentIds2.find(
      (id) => id && id !== firstAgentId && id !== secondAgentId
    );
    expect(thirdAgentId).toBeTruthy();

    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Agent 3 Message ${i}`);
      await messageInput.press('Enter');
    }
    await expect(activeChat(window).userMessages).toHaveCount(15, { timeout: 10000 });
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Switch to agent-1 and verify scroll position is preserved (button still visible)
    await window.locator(`[data-testid="agent-icon-${firstAgentId}"]`).click();
    await expect(activeChat(window).messages.first()).toContainText('Agent 1 Message 1', {
      timeout: 5000,
    });
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Switch to agent-2 and verify scroll position is preserved
    await window.locator(`[data-testid="agent-icon-${secondAgentId}"]`).click();
    await expect(activeChat(window).messages.first()).toContainText('Agent 2 Message 1', {
      timeout: 5000,
    });
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Switch to agent-3 and verify scroll position is preserved
    await window.locator(`[data-testid="agent-icon-${thirdAgentId}"]`).click();
    await expect(activeChat(window).messages.first()).toContainText('Agent 3 Message 1', {
      timeout: 5000,
    });
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });
  });

  /* Preconditions: New agent created with messages
     Action: Switch to agent for the first time
     Assertions: Chat scrolls to bottom automatically
     Requirements: agents.4.14.4 */
  test('should scroll to bottom on first visit to agent', async () => {
    const messageInput = activeChat(window).textarea;
    const messagesArea = activeChat(window).messagesArea;
    const newChatButton = window.locator('div[title="New chat"]');
    const scrollToBottomBtn = window.locator('[data-testid="scroll-to-bottom"]');

    // Wait for first agent to be auto-created
    let agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });

    // Save first agent ID
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    // Create agent-1 with messages and scroll up
    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Agent 1 Message ${i}`);
      await messageInput.press('Enter');
    }
    await expect(activeChat(window).messages).toHaveCount(15, { timeout: 5000 });

    // Scroll up in agent-1
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Create agent-2
    await newChatButton.click();

    agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(2, { timeout: 5000 });

    const allAgentIds1 = await agentIcons.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('data-testid')?.replace('agent-icon-', ''))
    );
    const secondAgentId = allAgentIds1.find((id) => id && id !== firstAgentId);
    expect(secondAgentId).toBeTruthy();

    // Send messages to agent-2
    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Agent 2 Message ${i}`);
      await messageInput.press('Enter');
    }
    await expect(activeChat(window).messages).toHaveCount(15, { timeout: 5000 });

    // On first visit agent-2 should be at bottom — scroll-to-bottom button NOT visible
    await expect(scrollToBottomBtn).not.toBeVisible({ timeout: 5000 });

    // Switch back to agent-1 (should restore saved scrolled-up position)
    await window.locator(`[data-testid="agent-icon-${firstAgentId}"]`).click();
    await expect(activeChat(window).messages.first()).toContainText('Agent 1 Message 1', {
      timeout: 5000,
    });

    // Agent-1 position is restored (scrolled up) — button visible
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Create agent-3 (new agent, first visit)
    await newChatButton.click();

    agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(3, { timeout: 5000 });

    const allAgentIds2 = await agentIcons.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('data-testid')?.replace('agent-icon-', ''))
    );
    const thirdAgentId = allAgentIds2.find(
      (id) => id && id !== firstAgentId && id !== secondAgentId
    );
    expect(thirdAgentId).toBeTruthy();

    // Send messages to agent-3
    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Agent 3 Message ${i}`);
      await messageInput.press('Enter');
    }
    await expect(activeChat(window).messages).toHaveCount(15, { timeout: 5000 });

    // On first visit agent-3 should also be at bottom — button NOT visible
    await expect(scrollToBottomBtn).not.toBeVisible({ timeout: 5000 });
  });
});
