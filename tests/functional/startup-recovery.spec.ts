/**
 * Functional Tests: App-restart recovery of stale messages
 *
 * Validates that startup reconciliation correctly finalizes stale tool_call records
 * and hides stale kind:llm messages after a forced process kill (SIGKILL) and restart.
 *
 * Exception: testing.3.13 — LLM is not used. These tests validate DB-level recovery
 * logic triggered on app startup, not LLM interaction. Approved by issue #94 scope.
 *
 * Requirements: llm-integration.11.6.3, llm-integration.11.6.4
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import {
  createMockOAuthServer,
  completeOAuthFlow,
  launchElectronWithMockOAuth,
  expectAgentsVisible,
  killElectron,
  getAgentIdsFromApi,
  ElectronTestContext,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

interface RawMessage {
  id: number;
  agentId: string;
  kind: string;
  done: boolean;
  hidden: boolean;
  payloadJson: string;
  timestamp: string;
  replyToMessageId: number | null;
}

let mockOAuthServer: MockOAuthServer;

test.beforeAll(async () => {
  mockOAuthServer = await createMockOAuthServer();
});

test.afterAll(async () => {
  if (mockOAuthServer) {
    await mockOAuthServer.stop();
  }
});

/**
 * Helper: Launch Electron, authenticate, and return context + agentId.
 * Requirements: testing.10
 */
// Requirements: llm-integration.11.6.3, llm-integration.11.6.4
async function launchAndAuthenticate(
  testDataPath?: string
): Promise<{ context: ElectronTestContext; agentId: string }> {
  mockOAuthServer.setUserProfile({
    id: 'test-recovery-user',
    email: 'recovery.test@example.com',
    name: 'Recovery Test User',
    given_name: 'Recovery',
    family_name: 'Test User',
  });

  const context = await launchElectronWithMockOAuth(mockOAuthServer, {}, testDataPath);

  await completeOAuthFlow(context.app, context.window);
  await expectAgentsVisible(context.window, 15000);

  const agentIds = await getAgentIdsFromApi(context.window);
  expect(agentIds.length).toBeGreaterThan(0);

  return { context, agentId: agentIds[0] };
}

/**
 * Helper: Invoke a test IPC handler from the renderer window.
 */
// Requirements: testing.3.1
async function invokeTestIpc(window: Page, channel: string, ...args: unknown[]): Promise<unknown> {
  return window.evaluate(
    async ({ channel, args }) => {
      return await (window as any).electron.ipcRenderer.invoke(channel, ...args);
    },
    { channel, args }
  );
}

/**
 * Helper: Get raw messages for an agent via test IPC.
 */
// Requirements: llm-integration.11.6.3, llm-integration.11.6.4
async function getRawMessages(window: Page, agentId: string): Promise<RawMessage[]> {
  const result = (await invokeTestIpc(window, 'test:get-messages-raw', agentId)) as {
    success: boolean;
    messages?: RawMessage[];
    error?: string;
  };
  if (!result.success) {
    throw new Error(`test:get-messages-raw failed: ${result.error}`);
  }
  return result.messages!;
}

test.describe('Startup Recovery after SIGKILL', () => {
  /* Preconditions: App launched, authenticated, stale tool_call(code_exec) injected (done=false)
     Action: SIGKILL the process, relaunch with same DB, re-authenticate
     Assertions: Stale tool_call now has done=true and status=cancelled
     Requirements: llm-integration.11.6.3 */
  test('should finalize stale tool_call records after SIGKILL restart', async () => {
    const { context, agentId } = await launchAndAuthenticate();
    let testDataPath: string;

    try {
      // Inject stale tool_call(code_exec) with done=false
      const injectResult = (await invokeTestIpc(
        context.window,
        'test:inject-stale-tool-call',
        agentId,
        'code_exec'
      )) as { success: boolean; messageId?: number };
      expect(injectResult.success).toBe(true);
      const staleMessageId = injectResult.messageId!;

      // Verify it was created with done=false
      const messagesBefore = await getRawMessages(context.window, agentId);
      const staleBefore = messagesBefore.find((m) => m.id === staleMessageId);
      expect(staleBefore).toBeDefined();
      expect(staleBefore!.done).toBe(false);
      expect(staleBefore!.kind).toBe('tool_call');

      // SIGKILL the process (simulates hard crash)
      testDataPath = await killElectron(context);
    } catch (error) {
      // Cleanup if we fail before kill
      try {
        await context.app.close();
      } catch {
        // Process may already be dead
      }
      if (fs.existsSync(context.testDataPath)) {
        fs.rmSync(context.testDataPath, { recursive: true, force: true });
      }
      throw error;
    }

    // Relaunch with same testDataPath (same DB)
    const { context: context2, agentId: agentId2 } = await launchAndAuthenticate(testDataPath);

    try {
      // After restart, startup reconciliation should have finalized the stale tool_call
      const messagesAfter = await getRawMessages(context2.window, agentId2);
      const staleAfter = messagesAfter.find((m) => m.kind === 'tool_call');
      expect(staleAfter).toBeDefined();
      expect(staleAfter!.done).toBe(true);

      // Verify the output has status=cancelled
      const payload = JSON.parse(staleAfter!.payloadJson) as {
        data?: { output?: { status?: string } };
      };
      expect(payload.data?.output?.status).toBe('cancelled');
    } finally {
      await context2.app.close();
      if (fs.existsSync(testDataPath)) {
        fs.rmSync(testDataPath, { recursive: true, force: true });
      }
    }
  });

  /* Preconditions: App launched, authenticated, stale kind:llm injected (done=false, hidden=false)
     Action: SIGKILL the process, relaunch with same DB, re-authenticate
     Assertions: Stale llm now has hidden=true, done remains false
     Requirements: llm-integration.11.6.4 */
  test('should hide stale llm messages after SIGKILL restart', async () => {
    const { context, agentId } = await launchAndAuthenticate();
    let testDataPath: string;

    try {
      // Inject stale kind:llm with done=false, hidden=false
      const injectResult = (await invokeTestIpc(
        context.window,
        'test:inject-stale-llm',
        agentId,
        'Partial streaming text...'
      )) as { success: boolean; messageId?: number };
      expect(injectResult.success).toBe(true);
      const staleMessageId = injectResult.messageId!;

      // Verify it was created with done=false, hidden=false
      const messagesBefore = await getRawMessages(context.window, agentId);
      const staleBefore = messagesBefore.find((m) => m.id === staleMessageId);
      expect(staleBefore).toBeDefined();
      expect(staleBefore!.done).toBe(false);
      expect(staleBefore!.hidden).toBe(false);
      expect(staleBefore!.kind).toBe('llm');

      // SIGKILL the process
      testDataPath = await killElectron(context);
    } catch (error) {
      try {
        await context.app.close();
      } catch {
        // Process may already be dead
      }
      if (fs.existsSync(context.testDataPath)) {
        fs.rmSync(context.testDataPath, { recursive: true, force: true });
      }
      throw error;
    }

    // Relaunch with same testDataPath (same DB)
    const { context: context2, agentId: agentId2 } = await launchAndAuthenticate(testDataPath);

    try {
      // After restart, startup reconciliation should have hidden the stale llm
      const messagesAfter = await getRawMessages(context2.window, agentId2);
      const staleAfter = messagesAfter.find((m) => m.kind === 'llm' && !m.done);
      expect(staleAfter).toBeDefined();
      expect(staleAfter!.hidden).toBe(true);
      // done should remain false (hideAndMarkIncomplete semantics)
      expect(staleAfter!.done).toBe(false);
    } finally {
      await context2.app.close();
      if (fs.existsSync(testDataPath)) {
        fs.rmSync(testDataPath, { recursive: true, force: true });
      }
    }
  });

  /* Preconditions: App launched, authenticated, both stale tool_call and stale llm injected
     Action: SIGKILL the process, relaunch with same DB, re-authenticate
     Assertions: Both stale records recovered (tool_call finalized, llm hidden)
     Requirements: llm-integration.11.6.3, llm-integration.11.6.4 */
  test('should recover both stale tool_call and stale llm after SIGKILL restart', async () => {
    const { context, agentId } = await launchAndAuthenticate();
    let testDataPath: string;

    try {
      // Inject stale tool_call
      const tcResult = (await invokeTestIpc(
        context.window,
        'test:inject-stale-tool-call',
        agentId,
        'code_exec'
      )) as { success: boolean; messageId?: number };
      expect(tcResult.success).toBe(true);

      // Inject stale llm
      const llmResult = (await invokeTestIpc(
        context.window,
        'test:inject-stale-llm',
        agentId,
        'Partial text...',
        'Partial reasoning...'
      )) as { success: boolean; messageId?: number };
      expect(llmResult.success).toBe(true);

      // Verify both are stale
      const messagesBefore = await getRawMessages(context.window, agentId);
      const toolCallBefore = messagesBefore.find((m) => m.kind === 'tool_call' && !m.done);
      const llmBefore = messagesBefore.find((m) => m.kind === 'llm' && !m.done && !m.hidden);
      expect(toolCallBefore).toBeDefined();
      expect(llmBefore).toBeDefined();

      // SIGKILL
      testDataPath = await killElectron(context);
    } catch (error) {
      try {
        await context.app.close();
      } catch {
        // Process may already be dead
      }
      if (fs.existsSync(context.testDataPath)) {
        fs.rmSync(context.testDataPath, { recursive: true, force: true });
      }
      throw error;
    }

    // Relaunch
    const { context: context2, agentId: agentId2 } = await launchAndAuthenticate(testDataPath);

    try {
      const messagesAfter = await getRawMessages(context2.window, agentId2);

      // tool_call should be finalized (done=true, status=cancelled)
      const toolCallAfter = messagesAfter.find((m) => m.kind === 'tool_call');
      expect(toolCallAfter).toBeDefined();
      expect(toolCallAfter!.done).toBe(true);
      const tcPayload = JSON.parse(toolCallAfter!.payloadJson) as {
        data?: { output?: { status?: string } };
      };
      expect(tcPayload.data?.output?.status).toBe('cancelled');

      // llm should be hidden (hidden=true, done=false)
      const llmAfter = messagesAfter.find((m) => m.kind === 'llm' && !m.done);
      expect(llmAfter).toBeDefined();
      expect(llmAfter!.hidden).toBe(true);
      expect(llmAfter!.done).toBe(false);
    } finally {
      await context2.app.close();
      if (fs.existsSync(testDataPath)) {
        fs.rmSync(testDataPath, { recursive: true, force: true });
      }
    }
  });

  /* Preconditions: App launched, authenticated, no stale messages
     Action: SIGKILL the process, relaunch with same DB, re-authenticate
     Assertions: App starts normally, no errors
     Requirements: llm-integration.11.6.3, llm-integration.11.6.4 */
  test('should handle SIGKILL restart with no stale messages (no-op)', async () => {
    const { context } = await launchAndAuthenticate();
    let testDataPath: string;

    try {
      // No stale messages injected — just kill the process
      testDataPath = await killElectron(context);
    } catch (error) {
      try {
        await context.app.close();
      } catch {
        // Process may already be dead
      }
      if (fs.existsSync(context.testDataPath)) {
        fs.rmSync(context.testDataPath, { recursive: true, force: true });
      }
      throw error;
    }

    // Relaunch — app should start normally without errors
    const { context: context2, agentId: agentId2 } = await launchAndAuthenticate(testDataPath);

    try {
      // App should be on agents screen
      await expect(context2.window.locator('[data-testid="agents"]')).toBeVisible({
        timeout: 10000,
      });

      // No error messages in the agent's messages
      const messages = await getRawMessages(context2.window, agentId2);
      const errorMessages = messages.filter((m) => m.kind === 'error');
      expect(errorMessages.length).toBe(0);
    } finally {
      await context2.app.close();
      if (fs.existsSync(testDataPath)) {
        fs.rmSync(testDataPath, { recursive: true, force: true });
      }
    }
  });
});
