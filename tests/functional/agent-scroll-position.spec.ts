/**
 * Functional Tests: Agent Scroll Position
 *
 * Tests for saving and restoring scroll position when switching between agents.
 * Requirements: agents.4.14
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { createMockOAuthServer, completeOAuthFlow } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let electronApp: ElectronApplication;
let window: Page;
let mockOAuthServer: MockOAuthServer;

test.beforeAll(async () => {
  mockOAuthServer = await createMockOAuthServer(8910);
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
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    const messagesArea = window.locator('[data-testid="messages-area"]');

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
      await window.waitForTimeout(100);
    }

    // Wait for all user messages to appear
    await expect(window.locator('[data-testid="message-user"]')).toHaveCount(15, {
      timeout: 10000,
    });

    // Wait for LLM response to the last message (previous ones are interrupted by rapid sending)
    await expect(window.locator('[data-testid="message-llm"]')).toHaveCount(1, { timeout: 60000 });

    // Scroll up in agent-1
    await messagesArea.evaluate((el) => {
      el.scrollTop = 100;
    });

    // Wait a bit for scroll to settle
    await window.waitForTimeout(300);

    // Get scroll position
    const scrollPosition1 = await messagesArea.evaluate((el) => el.scrollTop);
    expect(scrollPosition1).toBe(100);

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
    await expect(window.locator('[data-testid="message-user"]')).toHaveCount(15, { timeout: 5000 });

    // Check scroll position is restored
    const restoredPosition = await messagesArea.evaluate((el) => el.scrollTop);
    expect(restoredPosition).toBe(100);
  });

  /* Preconditions: Agent with scrollable content
     Action: Scroll up, send new message
     Assertions: Scroll position resets to bottom (autoscroll)
     Requirements: agents.4.14.5 */
  test('should reset scroll position when user sends message', async () => {
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    const messagesArea = window.locator('[data-testid="messages-area"]');

    // Send multiple messages to create scrollable content
    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Message ${i}`);
      await messageInput.press('Enter');
      await window.waitForTimeout(200);
    }

    await expect(window.locator('[data-testid="message"]')).toHaveCount(15, { timeout: 5000 });

    // Scroll up
    await messagesArea.evaluate((el) => {
      el.scrollTop = 100;
    });

    await window.waitForTimeout(300);

    const scrolledPosition = await messagesArea.evaluate((el) => el.scrollTop);
    expect(scrolledPosition).toBe(100);

    // Send new message
    await messageInput.fill('New message after scroll');
    await messageInput.press('Enter');

    // Wait for message and autoscroll
    await expect(window.locator('[data-testid="message"]')).toHaveCount(16, { timeout: 5000 });

    // Wait longer for smooth scroll animation to complete
    await window.waitForTimeout(1000);

    // Check scroll is at bottom
    const finalPosition = await messagesArea.evaluate((el) => {
      return Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight);
    });

    // Should be at bottom (within 50px tolerance)
    expect(finalPosition).toBeLessThan(50);
  });

  /* Preconditions: Three agents with different scroll positions
     Action: Switch between all three agents
     Assertions: Each agent maintains its own scroll position
     Requirements: agents.4.14.1, agents.4.14.2, agents.4.14.3 */
  test('should maintain independent scroll positions for multiple agents', async () => {
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    const messagesArea = window.locator('[data-testid="messages-area"]');
    const newChatButton = window.locator('div[title="New chat"]');

    // Wait for first agent to be auto-created
    let agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });

    // Save first agent ID
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    // Create agent-1 with messages and scroll to position 50
    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Agent 1 Message ${i}`);
      await messageInput.press('Enter');
      await window.waitForTimeout(150);
    }
    await messagesArea.evaluate((el) => {
      el.scrollTop = 50;
    });
    await window.waitForTimeout(200);

    // Create agent-2 with messages and scroll to position 150
    await newChatButton.click();

    // Re-create locator and get second agent ID
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
      await window.waitForTimeout(150);
    }
    await messagesArea.evaluate((el) => {
      el.scrollTop = 150;
    });
    await window.waitForTimeout(200);

    // Create agent-3 with messages and scroll to position 250
    await newChatButton.click();

    // Re-create locator and get third agent ID
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
      await window.waitForTimeout(150);
    }
    await messagesArea.evaluate((el) => {
      el.scrollTop = 250;
    });
    await window.waitForTimeout(200);

    // Switch to agent-1 using ID and verify position
    await window.locator(`[data-testid="agent-icon-${firstAgentId}"]`).click();
    await expect(window.locator('[data-testid="message"]').first()).toContainText(
      'Agent 1 Message 1',
      { timeout: 5000 }
    );
    const position1 = await messagesArea.evaluate((el) => el.scrollTop);
    expect(position1).toBe(50);

    // Switch to agent-2 using ID and verify position
    await window.locator(`[data-testid="agent-icon-${secondAgentId}"]`).click();
    await expect(window.locator('[data-testid="message"]').first()).toContainText(
      'Agent 2 Message 1',
      { timeout: 5000 }
    );
    const position2 = await messagesArea.evaluate((el) => el.scrollTop);
    expect(position2).toBe(150);

    // Switch to agent-3 using ID and verify position
    await window.locator(`[data-testid="agent-icon-${thirdAgentId}"]`).click();
    await expect(window.locator('[data-testid="message"]').first()).toContainText(
      'Agent 3 Message 1',
      { timeout: 5000 }
    );
    const position3 = await messagesArea.evaluate((el) => el.scrollTop);
    expect(position3).toBe(250);
  });

  /* Preconditions: New agent created with messages
     Action: Switch to agent for the first time
     Assertions: Chat scrolls to bottom automatically
     Requirements: agents.4.14.4 */
  test('should scroll to bottom on first visit to agent', async () => {
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    const messagesArea = window.locator('[data-testid="messages-area"]');
    const newChatButton = window.locator('div[title="New chat"]');

    // Wait for first agent to be auto-created
    let agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });

    // Save first agent ID
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    // Create agent-1 with messages
    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Agent 1 Message ${i}`);
      await messageInput.press('Enter');
      await window.waitForTimeout(150);
    }

    await expect(window.locator('[data-testid="message"]')).toHaveCount(15, { timeout: 5000 });

    // Scroll up in agent-1
    await messagesArea.evaluate((el) => {
      el.scrollTop = 100;
    });
    await window.waitForTimeout(200);

    // Create agent-2
    await newChatButton.click();

    // Re-create locator and get second agent ID
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
      await window.waitForTimeout(150);
    }

    await expect(window.locator('[data-testid="message"]')).toHaveCount(15, { timeout: 5000 });

    // Wait longer for autoscroll to complete (first visit should scroll to bottom)
    await window.waitForTimeout(1000);

    // Check that agent-2 is scrolled to bottom on first visit
    const distanceFromBottom = await messagesArea.evaluate((el) => {
      return el.scrollHeight - el.scrollTop - el.clientHeight;
    });
    expect(distanceFromBottom).toBeLessThan(50);

    // Now switch back to agent-1 using ID (should restore saved position, not scroll to bottom)
    await window.locator(`[data-testid="agent-icon-${firstAgentId}"]`).click();
    await expect(window.locator('[data-testid="message"]').first()).toContainText(
      'Agent 1 Message 1',
      { timeout: 5000 }
    );

    // Check that agent-1 position is restored (not at bottom)
    const agent1Position = await messagesArea.evaluate((el) => el.scrollTop);
    expect(agent1Position).toBe(100);

    // Create agent-3 (new agent)
    await newChatButton.click();

    // Re-create locator and get third agent ID
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
      await window.waitForTimeout(150);
    }

    await expect(window.locator('[data-testid="message"]')).toHaveCount(15, { timeout: 5000 });
    await window.waitForTimeout(1000);

    // Check that agent-3 is also scrolled to bottom on first visit
    const agent3DistanceFromBottom = await messagesArea.evaluate((el) => {
      return el.scrollHeight - el.scrollTop - el.clientHeight;
    });
    expect(agent3DistanceFromBottom).toBeLessThan(50);
  });
});
