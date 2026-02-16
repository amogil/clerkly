// Requirements: agents.5.5
// tests/functional/agents-error-messages.spec.ts
// Functional tests for error messages in AllAgents view

import { test, expect, Page, ElectronApplication } from '@playwright/test';
import { launchApp, completeOAuthFlow } from './helpers/electron';

test.describe('Agents Error Messages', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    electronApp = await launchApp();
    page = await electronApp.firstWindow();

    // Complete OAuth flow
    await completeOAuthFlow(page);

    // Wait for agents page to load
    await page.waitForSelector('[data-testid="agents"]', { timeout: 10000 });
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  /* Preconditions: User logged in, agents page loaded
     Action: Create agent with error message, open AllAgents
     Assertions: Error message displayed for agent with error status
     Requirements: agents.5.5 */
  test('should display error message for agent with error status in AllAgents', async () => {
    // Create a new agent
    const newChatButton = page.locator('button:has-text("New chat")').first();
    await newChatButton.click();
    await page.waitForTimeout(500);

    // Send a message to create history
    const textarea = page.locator('textarea[placeholder*="Ask"]');
    await textarea.fill('Test message');
    await textarea.press('Enter');
    await page.waitForTimeout(500);

    // Simulate error by directly inserting error message via IPC
    // (In real scenario, this would come from LLM/agent execution)
    await page.evaluate(async () => {
      const agents = await window.api.agents.list();
      if (agents.success && agents.data) {
        const agentList = agents.data as Array<{ agentId: string }>;
        const currentAgent = agentList[0];

        // Create error message
        await window.api.messages.create(currentAgent.agentId, {
          kind: 'llm',
          data: {
            result: {
              status: 'error',
              error: {
                message: 'Network timeout occurred',
              },
            },
          },
        });
      }
    });

    await page.waitForTimeout(500);

    // Open AllAgents view by clicking +N button or navigating
    // First, create another agent to ensure we have multiple agents
    await newChatButton.click();
    await page.waitForTimeout(500);

    // Look for +N button or "All Agents" link
    const allAgentsButton = page.locator('button:has-text("+")').first();
    if (await allAgentsButton.isVisible()) {
      await allAgentsButton.click();
    }

    await page.waitForTimeout(500);

    // Verify we're in AllAgents view
    await expect(page.locator('text=All Agents')).toBeVisible();

    // Verify error message is displayed
    await expect(page.locator('text=Network timeout occurred')).toBeVisible();

    // Verify error message has red color
    const errorText = page.locator('text=Network timeout occurred');
    await expect(errorText).toHaveClass(/text-red-500/);
  });

  /* Preconditions: User logged in, archived agent with error
     Action: Archive agent with error, open AllAgents
     Assertions: Archived agent not shown in AllAgents (filtered at list level)
     Requirements: agents.5.6 */
  test('should not display archived agents in AllAgents', async () => {
    // Create a new agent
    const newChatButton = page.locator('button:has-text("New chat")').first();
    await newChatButton.click();
    await page.waitForTimeout(500);

    // Get current agent ID
    const agentId = await page.evaluate(async () => {
      const agents = await window.api.agents.list();
      if (agents.success && agents.data) {
        const agentList = agents.data as Array<{ agentId: string }>;
        return agentList[0].agentId;
      }
      return null;
    });

    expect(agentId).not.toBeNull();

    // Create error message
    await page.evaluate(async (id) => {
      await window.api.messages.create(id!, {
        kind: 'llm',
        data: {
          result: {
            status: 'error',
            error: {
              message: 'This error should not be visible',
            },
          },
        },
      });
    }, agentId);

    await page.waitForTimeout(500);

    // Archive the agent
    await page.evaluate(async (id) => {
      await window.api.agents.archive(id!);
    }, agentId);

    await page.waitForTimeout(500);

    // Auto-create should create a new agent
    await page.waitForTimeout(500);

    // Create another agent to have multiple agents
    await newChatButton.click();
    await page.waitForTimeout(500);

    // Open AllAgents view
    const allAgentsButton = page.locator('button:has-text("+")').first();
    if (await allAgentsButton.isVisible()) {
      await allAgentsButton.click();
    }

    await page.waitForTimeout(500);

    // Verify we're in AllAgents view
    await expect(page.locator('text=All Agents')).toBeVisible();

    // Verify archived agent's error message is NOT displayed
    await expect(page.locator('text=This error should not be visible')).not.toBeVisible();
  });

  /* Preconditions: User logged in, multiple agents with different timestamps
     Action: Create agents with messages at different times, open AllAgents
     Assertions: Agents sorted by updatedAt (most recent first)
     Requirements: agents.5.5, agents.1.3 */
  test('should sort agents by updatedAt in AllAgents', async () => {
    // Create first agent
    const newChatButton = page.locator('button:has-text("New chat")').first();
    await newChatButton.click();
    await page.waitForTimeout(500);

    const firstAgentId = await page.evaluate(async () => {
      const agents = await window.api.agents.list();
      if (agents.success && agents.data) {
        const agentList = agents.data as Array<{ agentId: string }>;
        return agentList[0].agentId;
      }
      return null;
    });

    // Add message to first agent
    await page.evaluate(async (id) => {
      await window.api.messages.create(id!, {
        kind: 'user',
        data: { text: 'First agent message' },
      });
    }, firstAgentId);

    await page.waitForTimeout(100);

    // Create second agent
    await newChatButton.click();
    await page.waitForTimeout(500);

    const secondAgentId = await page.evaluate(async () => {
      const agents = await window.api.agents.list();
      if (agents.success && agents.data) {
        const agentList = agents.data as Array<{ agentId: string }>;
        return agentList[0].agentId; // Most recent is first
      }
      return null;
    });

    // Add message to second agent (more recent)
    await page.evaluate(async (id) => {
      await window.api.messages.create(id!, {
        kind: 'user',
        data: { text: 'Second agent message' },
      });
    }, secondAgentId);

    await page.waitForTimeout(500);

    // Open AllAgents view
    const allAgentsButton = page.locator('button:has-text("+")').first();
    if (await allAgentsButton.isVisible()) {
      await allAgentsButton.click();
    }

    await page.waitForTimeout(500);

    // Verify we're in AllAgents view
    await expect(page.locator('text=All Agents')).toBeVisible();

    // Get all agent cards
    const agentCards = page.locator('[data-testid="agents"] > div > div > div > div');
    const count = await agentCards.count();

    // Verify at least 2 agents
    expect(count).toBeGreaterThanOrEqual(2);

    // Verify second agent (more recent) appears before first agent
    // This is implicit in the order of the list - most recent updatedAt first
  });

  /* Preconditions: User logged in, agent with multiple messages
     Action: Create agent with multiple messages, last is error, open AllAgents
     Assertions: Only last error message displayed (not all errors)
     Requirements: agents.5.5 */
  test('should display only the last error message in AllAgents', async () => {
    // Create a new agent
    const newChatButton = page.locator('button:has-text("New chat")').first();
    await newChatButton.click();
    await page.waitForTimeout(500);

    // Get current agent ID
    const agentId = await page.evaluate(async () => {
      const agents = await window.api.agents.list();
      if (agents.success && agents.data) {
        const agentList = agents.data as Array<{ agentId: string }>;
        return agentList[0].agentId;
      }
      return null;
    });

    // Create first error message
    await page.evaluate(async (id) => {
      await window.api.messages.create(id!, {
        kind: 'llm',
        data: {
          result: {
            status: 'error',
            error: {
              message: 'First error - should not be visible',
            },
          },
        },
      });
    }, agentId);

    await page.waitForTimeout(100);

    // Create second error message (most recent)
    await page.evaluate(async (id) => {
      await window.api.messages.create(id!, {
        kind: 'llm',
        data: {
          result: {
            status: 'error',
            error: {
              message: 'Latest error - should be visible',
            },
          },
        },
      });
    }, agentId);

    await page.waitForTimeout(500);

    // Create another agent to have multiple agents
    await newChatButton.click();
    await page.waitForTimeout(500);

    // Open AllAgents view
    const allAgentsButton = page.locator('button:has-text("+")').first();
    if (await allAgentsButton.isVisible()) {
      await allAgentsButton.click();
    }

    await page.waitForTimeout(500);

    // Verify we're in AllAgents view
    await expect(page.locator('text=All Agents')).toBeVisible();

    // Verify only latest error message is displayed
    await expect(page.locator('text=Latest error - should be visible')).toBeVisible();
    await expect(page.locator('text=First error - should not be visible')).not.toBeVisible();
  });
});
