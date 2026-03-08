/**
 * Functional Tests: Agent Status In All Places
 *
 * Verifies that each agent status is rendered consistently across:
 * - Active header status (text + avatar color)
 * - Header agent icon tooltip (status text)
 * - All Agents card (status text + avatar color)
 *
 * Requirements: agents.6.1, agents.6.2, agents.6.3, agents.6.4, agents.6.5
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  completeOAuthFlow,
  createMockOAuthServer,
  launchElectronWithMockOAuth,
  expectAgentsVisible,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

type StatusCase = {
  status: 'new' | 'in-progress' | 'awaiting-response' | 'error' | 'completed';
  label: 'New' | 'In progress' | 'Awaiting response' | 'Error' | 'Completed';
  colorClass: 'bg-sky-400' | 'bg-blue-500' | 'bg-amber-500' | 'bg-red-500' | 'bg-green-500';
  textClass:
    | 'text-sky-600'
    | 'text-blue-600'
    | 'text-amber-600'
    | 'text-red-600'
    | 'text-green-600';
};

const STATUS_CASES: StatusCase[] = [
  { status: 'new', label: 'New', colorClass: 'bg-sky-400', textClass: 'text-sky-600' },
  {
    status: 'in-progress',
    label: 'In progress',
    colorClass: 'bg-blue-500',
    textClass: 'text-blue-600',
  },
  {
    status: 'awaiting-response',
    label: 'Awaiting response',
    colorClass: 'bg-amber-500',
    textClass: 'text-amber-600',
  },
  { status: 'error', label: 'Error', colorClass: 'bg-red-500', textClass: 'text-red-600' },
  {
    status: 'completed',
    label: 'Completed',
    colorClass: 'bg-green-500',
    textClass: 'text-green-600',
  },
];

let electronApp: ElectronApplication;
let window: Page;
let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer();
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});

test.beforeEach(async () => {
  const context = await launchElectronWithMockOAuth(mockServer, {
    CLERKLY_OAUTH_CLIENT_ID: 'test-client-id',
    CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret',
  });
  electronApp = context.app;
  window = context.window;

  await completeOAuthFlow(electronApp, window);
  await expectAgentsVisible(window, 10000);
});

test.afterEach(async () => {
  await electronApp.close();
});

async function createNamedAgent(window: Page, name: string): Promise<string> {
  return window.evaluate(async (agentName) => {
    const createResult = await (window as any).api.agents.create(agentName);
    if (!createResult?.success) {
      throw new Error(createResult?.error || 'Failed to create agent');
    }

    const listResult = await (window as any).api.agents.list();
    if (!listResult?.success || !Array.isArray(listResult?.data)) {
      throw new Error(listResult?.error || 'Failed to list agents');
    }

    const created = (listResult.data as Array<{ id: string; name?: string }>).find(
      (agent) => agent.name === agentName
    );
    if (!created?.id) {
      throw new Error(`Created agent not found by name: ${agentName}`);
    }

    return created.id;
  }, name);
}

async function setAgentStatus(
  window: Page,
  agentId: string,
  status: StatusCase['status']
): Promise<void> {
  const result = await window.evaluate(
    async ({ id, nextStatus }) => {
      return await (window as any).api.test.setAgentStatus(id, nextStatus);
    },
    { id: agentId, nextStatus: status }
  );

  expect(result.success).toBe(true);
}

async function ensureAllAgentsButtonVisible(window: Page): Promise<void> {
  const allAgentsButton = window.locator('[data-testid="all-agents-button"]');
  if ((await allAgentsButton.count()) > 0) {
    await expect(allAgentsButton).toBeVisible();
    return;
  }

  for (let i = 0; i < 12; i++) {
    await window.evaluate(async (index) => {
      await (window as any).api.agents.create(`Overflow Agent ${index}`);
    }, i);
  }

  await expect(allAgentsButton).toBeVisible({ timeout: 10000 });
}

async function assertStatusAcrossAllPlaces(
  window: Page,
  agentId: string,
  agentName: string,
  statusCase: StatusCase
): Promise<void> {
  const icon = window.locator(`[data-testid="agent-icon-${agentId}"]`);
  await expect(icon).toBeVisible();
  await icon.click();

  const iconAvatar = icon.locator('[data-testid="agent-avatar-icon"]');
  await expect
    .poll(async () => await iconAvatar.getAttribute('class'), { timeout: 5000 })
    .toContain(statusCase.colorClass);

  const headerName = window.locator(`h3:has-text("${agentName}")`).first();
  await expect(headerName).toBeVisible();

  const headerStatusText = headerName.locator('xpath=following-sibling::div/span[1]');
  await expect(headerStatusText).toHaveText(statusCase.label);

  await icon.hover();
  const tooltip = icon.locator('div.absolute.top-full');
  await expect(tooltip).toBeVisible({ timeout: 5000 });
  await expect(tooltip).toContainText(statusCase.label);

  await ensureAllAgentsButtonVisible(window);
  await window.locator('[data-testid="all-agents-button"]').click();

  await expect(window.locator('text=All Agents')).toBeVisible({ timeout: 5000 });
  const agentCard = window.locator(`[data-testid="agent-card-${agentId}"]`);
  await expect(agentCard).toBeVisible({ timeout: 5000 });

  await expect(agentCard.locator(`span.${statusCase.textClass}`)).toHaveText(statusCase.label);
  const cardAvatar = agentCard.locator('[data-testid="agent-avatar-icon"]');
  await expect(cardAvatar).toHaveClass(new RegExp(statusCase.colorClass));
}

test.describe('Agent Status In All Places', () => {
  for (const statusCase of STATUS_CASES) {
    /* Preconditions: Agent exists
       Action: Set deterministic status fixture and inspect all status UI locations
       Assertions: Status text and color are consistent across header, icon tooltip, and All Agents
       Requirements: agents.6.1, agents.6.2, agents.6.3, agents.6.4, agents.6.5 */
    test(`should render "${statusCase.status}" status consistently in all places`, async () => {
      const agentName = `Status ${statusCase.status} Agent`;
      const agentId = await createNamedAgent(window, agentName);

      if (statusCase.status !== 'new') {
        await setAgentStatus(window, agentId, statusCase.status);
      }

      await assertStatusAcrossAllPlaces(window, agentId, agentName, statusCase);
    });
  }
});
