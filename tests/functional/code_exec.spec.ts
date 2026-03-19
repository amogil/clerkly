/**
 * Functional Tests: code_exec
 *
 * Requirements: code_exec.1, code_exec.3, code_exec.4, code_exec.5, agents.7.4
 */

import * as http from 'http';
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  completeOAuthFlow,
  createMockOAuthServer,
  expectAgentsVisible,
  expectNoToastError,
  getAgentIdsFromApi,
  getFreePort,
  launchElectronWithMockOAuth,
} from './helpers/electron';
import { MockLLMServer } from './helpers/mock-llm-server';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let electronApp: ElectronApplication;
let window: Page;
let mockOAuthServer: MockOAuthServer;
let mockLLMServer: MockLLMServer;
let mockLLMPort: number;
let appClosedInTest: boolean;

async function launchWithMockLLM() {
  const context = await launchElectronWithMockOAuth(mockOAuthServer, {
    CLERKLY_OPENAI_API_URL: `http://localhost:${mockLLMPort}/v1/responses`,
    CLERKLY_OPENAI_API_KEY: 'mock-key-for-code-exec-tests',
  });
  electronApp = context.app;
  window = context.window;
  await completeOAuthFlow(electronApp, window);
  await expectAgentsVisible(window, 10000);
}

async function sendUserMessage(text: string) {
  const input = window.locator(
    '[data-testid="agent-chat-root"][data-active="true"] [data-testid="auto-expanding-textarea"]'
  );
  await expect(input).toHaveCount(1, { timeout: 5000 });
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.click();
  await input.fill(text);
  await expect(input).toHaveValue(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

async function getToolCallMessages(agentId: string): Promise<Array<Record<string, unknown>>> {
  return window.evaluate(async (id) => {
    const api = (window as unknown as { api: any }).api;
    const result = await api.messages.list(id);
    if (!result?.success || !Array.isArray(result.data)) {
      return [];
    }
    return result.data.filter((message: Record<string, unknown>) => message.kind === 'tool_call');
  }, agentId);
}

async function getAllMessages(agentId: string): Promise<Array<Record<string, unknown>>> {
  return window.evaluate(async (id) => {
    const api = (window as unknown as { api: any }).api;
    const result = await api.messages.list(id);
    if (!result?.success || !Array.isArray(result.data)) {
      return [];
    }
    return result.data as Array<Record<string, unknown>>;
  }, agentId);
}

// Requirements: sandbox-http-request.3, sandbox-http-request.4
async function getCodeExecOutputByCallId(
  agentId: string,
  callId: string
): Promise<Record<string, unknown> | undefined> {
  const codeExecCall = await findCodeExecCallByCallId(agentId, callId);
  return codeExecCall?.payload?.data?.output as Record<string, unknown> | undefined;
}

async function findCodeExecCallByCallId(
  agentId: string,
  callId: string
): Promise<
  | {
      kind?: string;
      done?: boolean;
      replyToMessageId?: number | null;
      payload?: {
        data?: {
          callId?: string;
          toolName?: string;
          output?: {
            status?: string;
            error?: { code?: string; message?: string };
            started_at?: string;
            finished_at?: string;
            duration_ms?: number;
          };
        };
      };
    }
  | undefined
> {
  type CodeExecCall = {
    kind?: string;
    done?: boolean;
    replyToMessageId?: number | null;
    payload?: {
      data?: {
        callId?: string;
        toolName?: string;
        output?: {
          status?: string;
          error?: { code?: string; message?: string };
          started_at?: string;
          finished_at?: string;
          duration_ms?: number;
        };
      };
    };
  };

  let lastMatch: CodeExecCall | undefined;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const toolCalls = await getToolCallMessages(agentId);
    const matches = toolCalls.filter((entry) => {
      const payload = entry.payload as { data?: { callId?: string; toolName?: string } };
      return payload?.data?.toolName === 'code_exec' && payload?.data?.callId === callId;
    }) as CodeExecCall[];

    if (matches.length > 0) {
      lastMatch = matches[matches.length - 1];
      const status = lastMatch.payload?.data?.output?.status;
      if (lastMatch.done === true || (status !== undefined && status !== 'running')) {
        return lastMatch;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return lastMatch;
}

test.beforeAll(async () => {
  mockOAuthServer = await createMockOAuthServer();
  mockLLMPort = await getFreePort();
  mockLLMServer = new MockLLMServer({ port: mockLLMPort });
  await mockLLMServer.start();
});

test.afterAll(async () => {
  if (mockLLMServer) {
    await mockLLMServer.stop();
  }
  if (mockOAuthServer) {
    await mockOAuthServer.stop();
  }
});

test.beforeEach(async () => {
  appClosedInTest = false;
  mockOAuthServer.setUserProfile({
    id: 'test-code-exec-user',
    email: 'code.exec@example.com',
    name: 'Code Exec User',
    given_name: 'Code',
    family_name: 'Exec User',
  });
  mockLLMServer.clearRequestLogs();
  mockLLMServer.setSuccess(true);
  mockLLMServer.setStreamingMode(false);
  mockLLMServer.setOpenAIStreamScripts([]);
});

test.afterEach(async () => {
  if (electronApp && !appClosedInTest) {
    await electronApp.close();
  }
});

test.describe('code_exec tool_call rendering', () => {
  /* Preconditions: authenticated app with one visible agent
     Action: create persisted kind:tool_call with toolName=code_exec and terminal output, then expand collapsed block by standard ToolHeader toggle
     Assertions: dedicated code_exec block renders standard ToolHeader toggle with task summary and status icon, starts collapsed by default, and shows JavaScript input plus persisted sections after expand
     Exception Rationale (testing.3.13): this test validates renderer behavior for an already persisted historical
     tool_call(code_exec) message and intentionally bypasses LLM transport; LLM+UI path coverage remains in
     code_exec tool-loop scenarios below.
     Requirements: agents.7.4.5, agents.7.4.6, agents.7.4.7 */
  test('should render tool_call(code_exec) message block with standard ToolHeader toggle and JavaScript input', async () => {
    await launchWithMockLLM();
    const agentId = (await getAgentIdsFromApi(window))[0];
    expect(agentId).toBeTruthy();

    await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      const result = await api.messages.create(id, 'tool_call', {
        data: {
          callId: 'code-1',
          toolName: 'code_exec',
          arguments: {
            task_summary: 'Print ok to stdout',
            code: "console.log('ok')",
            timeout_ms: 10000,
          },
          output: {
            status: 'success',
            stdout: 'ok\\n',
            stderr: 'warn\\n',
            stdout_truncated: false,
            stderr_truncated: false,
          },
        },
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create code_exec tool_call');
      }
    }, agentId as string);

    await expect(window.locator('[data-testid="message-code-exec-block"]').last()).toBeVisible({
      timeout: 5000,
    });
    await expect(window.locator('[data-testid="message-code-exec-toggle"]').last()).toContainText(
      'Print ok to stdout'
    );
    await expect(
      window.locator('[data-testid="message-code-exec-status-icon"][data-status="success"]').last()
    ).toBeVisible();
    await expect(window.locator('[data-testid="message-code-exec-input"]')).toHaveCount(0);
    await expect(window.locator('[data-testid="message-code-exec-stdout"]')).toHaveCount(0);
    await expect(window.locator('[data-testid="message-code-exec-stderr"]')).toHaveCount(0);

    await window.locator('[data-testid="message-code-exec-toggle"]').last().click();

    const inputSection = window.locator('[data-testid="message-code-exec-input"]').last();
    await expect(inputSection.locator('[data-streamdown="code-block-header"]')).toContainText(
      'JavaScript'
    );
    await expect(inputSection).toContainText("console.log('ok')");
    const stdoutSection = window.locator('[data-testid="message-code-exec-stdout"]').last();
    await expect(stdoutSection.locator('[data-streamdown="code-block-header"]')).toContainText(
      'Output'
    );
    await expect(stdoutSection).toContainText('ok');
    const stderrSection = window.locator('[data-testid="message-code-exec-stderr"]').last();
    await expect(stderrSection.locator('[data-streamdown="code-block-header"]')).toContainText(
      'Output'
    );
    await expect(stderrSection).toContainText('warn');
    await expect(
      window
        .locator('[data-testid="message-code-exec-stdout"]')
        .last()
        .locator('[data-streamdown="code-block-actions"]')
    ).toBeVisible();
    await expect(
      window
        .locator('[data-testid="message-code-exec-stderr"]')
        .last()
        .locator('[data-streamdown="code-block-actions"]')
    ).toBeVisible();

    await expectNoToastError(window);
  });

  /* Preconditions: authenticated app with one visible agent
     Action: create persisted kind:tool_call with toolName=code_exec, expand it via chevron click, collapse it via right-edge click, then reopen via the same standard toggle
     Assertions: collapsed content is removed from visible UI and standard ToolHeader toggle remains usable across chevron, right-edge, and whole-header clicks
     Exception Rationale (testing.3.13): this test validates renderer behavior for persisted historical
     tool_call(code_exec) message and intentionally bypasses LLM transport; LLM+UI path coverage remains in
     code_exec tool-loop scenarios below.
     Requirements: agents.7.4.7 */
  test('should keep standard code_exec toggle usable after reopen cycle', async () => {
    await launchWithMockLLM();
    const agentId = (await getAgentIdsFromApi(window))[0];
    expect(agentId).toBeTruthy();

    await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      const result = await api.messages.create(id, 'tool_call', {
        data: {
          callId: 'code-collapse-1',
          toolName: 'code_exec',
          arguments: {
            task_summary: 'Print ok to stdout',
            code: "console.log('ok')",
            timeout_ms: 10000,
          },
          output: {
            status: 'success',
            stdout: 'ok\\n',
            stderr: 'warn\\n',
            stdout_truncated: false,
            stderr_truncated: false,
          },
        },
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create code_exec tool_call for collapse test');
      }
    }, agentId as string);

    const toggle = window.locator('[data-testid="message-code-exec-toggle"]').last();
    await expect(toggle).toBeVisible({ timeout: 5000 });
    await expect(window.locator('[data-testid="message-code-exec-input"]')).toHaveCount(0);
    await expect(window.locator('[data-testid="app-loading-screen"]')).toHaveCount(0);

    await toggle.locator('svg').last().click();
    await expect(window.locator('[data-testid="message-code-exec-input"]').last()).toContainText(
      "console.log('ok')"
    );

    const toggleBox = await toggle.boundingBox();
    expect(toggleBox).toBeTruthy();
    await toggle.click({ position: { x: toggleBox!.width - 16, y: toggleBox!.height / 2 } });
    await expect(window.locator('[data-testid="message-code-exec-input"]')).toHaveCount(0);
    await expect(window.locator('[data-testid="message-code-exec-stdout"]')).toHaveCount(0);
    await expect(window.locator('[data-testid="message-code-exec-stderr"]')).toHaveCount(0);

    await toggle.click();
    await expect(window.locator('[data-testid="message-code-exec-input"]').last()).toContainText(
      "console.log('ok')"
    );
    await expect(window.locator('[data-testid="message-code-exec-stdout"]').last()).toContainText(
      'ok'
    );
    await expect(window.locator('[data-testid="message-code-exec-stderr"]').last()).toContainText(
      'warn'
    );

    await expectNoToastError(window);
  });

  /* Preconditions: authenticated app with one visible agent and collapsed persisted code_exec block after one open-close cycle
     Action: hover and click the top-right corner of the header where hidden code-block actions previously overlapped the chevron area
     Assertions: no download tooltip appears and the same top-right hit area still toggles the block open
     Exception Rationale (testing.3.13): this test validates persisted historical renderer behavior and specifically guards the header hit-area bug.
     Requirements: agents.7.4.6.2, agents.7.4.6.2.1, agents.7.4.7 */
  test('should keep the top-right code_exec header area free of hidden code-block actions', async () => {
    await launchWithMockLLM();
    const agentId = (await getAgentIdsFromApi(window))[0];
    expect(agentId).toBeTruthy();

    await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      const result = await api.messages.create(id, 'tool_call', {
        data: {
          callId: 'code-header-hit-area-1',
          toolName: 'code_exec',
          arguments: {
            task_summary: 'Inspect top-right hit area',
            code: "console.log('ok')",
            timeout_ms: 10000,
          },
          output: {
            status: 'success',
            stdout: 'ok\\n',
            stderr: '',
            stdout_truncated: false,
            stderr_truncated: false,
          },
        },
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create code_exec tool_call for hit-area test');
      }
    }, agentId as string);

    const toggle = window.locator('[data-testid="message-code-exec-toggle"]').last();
    await expect(toggle).toBeVisible({ timeout: 5000 });

    await toggle.click();
    await expect(window.locator('[data-testid="message-code-exec-input"]').last()).toContainText(
      "console.log('ok')"
    );
    await toggle.click();
    await expect(window.locator('[data-testid="message-code-exec-input"]')).toHaveCount(0);

    const toggleBox = await toggle.boundingBox();
    expect(toggleBox).toBeTruthy();
    await toggle.hover({ position: { x: toggleBox!.width - 12, y: toggleBox!.height / 2 } });
    await expect(window.getByText('Download file')).toHaveCount(0);

    await toggle.click({ position: { x: toggleBox!.width - 12, y: toggleBox!.height / 2 } });
    await expect(window.locator('[data-testid="message-code-exec-input"]').last()).toContainText(
      "console.log('ok')"
    );

    await expectNoToastError(window);
  });

  /* Preconditions: authenticated app with one visible agent
     Action: create persisted kind:tool_call with toolName=code_exec and terminal structured output.error, then expand collapsed block
     Assertions: code_exec block renders a separate error section in addition to stderr and shows standard code-block actions
     Exception Rationale (testing.3.13): this test validates renderer behavior for persisted historical
     tool_call(code_exec) message and intentionally bypasses LLM transport; LLM+UI path coverage remains in
     code_exec tool-loop scenarios below.
     Requirements: agents.7.4.6, agents.7.4.6.5.1, agents.7.4.6.5.2, agents.7.4.7, agents.7.4.9 */
  test('should render code_exec error section from structured output.error', async () => {
    await launchWithMockLLM();
    const agentId = (await getAgentIdsFromApi(window))[0];
    expect(agentId).toBeTruthy();

    await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      const result = await api.messages.create(id, 'tool_call', {
        data: {
          callId: 'code-error-1',
          toolName: 'code_exec',
          arguments: {
            task_summary: 'Attempt forbidden request',
            code: "window.open('https://example.com')",
            timeout_ms: 10000,
          },
          output: {
            status: 'error',
            stdout: '',
            stderr: 'console.error fallback\\n',
            stdout_truncated: false,
            stderr_truncated: false,
            error: {
              code: 'policy_denied',
              message: 'Tool is not allowed in sandbox allowlist.',
            },
          },
        },
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create code_exec tool_call with output.error');
      }
    }, agentId as string);

    await expect(window.locator('[data-testid="message-code-exec-block"]').last()).toBeVisible({
      timeout: 5000,
    });
    await expect(window.locator('[data-testid="message-code-exec-error"]')).toHaveCount(0);

    await window.locator('[data-testid="message-code-exec-toggle"]').last().click();

    await expect(
      window.locator('[data-testid="message-code-exec-status-icon"][data-status="error"]').last()
    ).toBeVisible();
    const stderrSection = window.locator('[data-testid="message-code-exec-stderr"]').last();
    await expect(stderrSection.locator('[data-streamdown="code-block-header"]')).toContainText(
      'Output'
    );
    await expect(stderrSection).toContainText('console.error fallback');
    const errorSection = window.locator('[data-testid="message-code-exec-error"]').last();
    await expect(errorSection.locator('[data-streamdown="code-block-header"]')).toContainText(
      'Error'
    );
    await expect(errorSection).toContainText(
      'policy_denied: Tool is not allowed in sandbox allowlist.'
    );
    await expect(errorSection.locator('[data-streamdown="code-block-actions"]')).toBeVisible();

    await expectNoToastError(window);
  });

  /* Preconditions: authenticated app with one visible agent
     Action: create persisted kind:tool_call with toolName=code_exec and cancelled terminal status
     Assertions: code_exec header shows cancelled status icon without the wrench icon
     Exception Rationale (testing.3.13): this test validates renderer behavior for persisted historical
     tool_call(code_exec) message and intentionally bypasses LLM transport.
     Requirements: agents.7.4.6.4, agents.7.4.6.4.1, agents.7.4.6.4.6 */
  test('should render cancelled status icon in code_exec header', async () => {
    await launchWithMockLLM();
    const agentId = (await getAgentIdsFromApi(window))[0];
    expect(agentId).toBeTruthy();

    await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      const result = await api.messages.create(id, 'tool_call', {
        data: {
          callId: 'code-cancelled-1',
          toolName: 'code_exec',
          arguments: {
            task_summary: 'Cancelled request',
            code: "console.log('cancelled')",
            timeout_ms: 10000,
          },
          output: {
            status: 'cancelled',
            stdout: '',
            stderr: '',
            stdout_truncated: false,
            stderr_truncated: false,
          },
        },
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create cancelled code_exec tool_call');
      }
    }, agentId as string);

    const toggle = window.locator('[data-testid="message-code-exec-toggle"]').last();
    await expect(toggle).toBeVisible({ timeout: 5000 });
    await expect(
      window
        .locator('[data-testid="message-code-exec-status-icon"][data-status="cancelled"]')
        .last()
    ).toBeVisible();
    await expect(toggle.locator('svg.lucide-wrench')).toHaveCount(0);
    await expectNoToastError(window);
  });

  /* Preconditions: authenticated app with one visible agent
     Action: create persisted kind:tool_call with toolName=code_exec and timeout terminal status
     Assertions: code_exec header shows timeout status icon without the wrench icon
     Exception Rationale (testing.3.13): this test validates renderer behavior for persisted historical
     tool_call(code_exec) message and intentionally bypasses LLM transport.
     Requirements: agents.7.4.6.4, agents.7.4.6.4.1, agents.7.4.6.4.5 */
  test('should render timeout status icon in code_exec header', async () => {
    await launchWithMockLLM();
    const agentId = (await getAgentIdsFromApi(window))[0];
    expect(agentId).toBeTruthy();

    await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      const result = await api.messages.create(id, 'tool_call', {
        data: {
          callId: 'code-timeout-1',
          toolName: 'code_exec',
          arguments: {
            task_summary: 'Timed out request',
            code: 'while (true) {}',
            timeout_ms: 10000,
          },
          output: {
            status: 'timeout',
            stdout: '',
            stderr: '',
            stdout_truncated: false,
            stderr_truncated: false,
          },
        },
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create timeout code_exec tool_call');
      }
    }, agentId as string);

    const toggle = window.locator('[data-testid="message-code-exec-toggle"]').last();
    await expect(toggle).toBeVisible({ timeout: 5000 });
    await expect(
      window.locator('[data-testid="message-code-exec-status-icon"][data-status="timeout"]').last()
    ).toBeVisible();
    await expect(toggle.locator('svg.lucide-clock-alert')).toHaveCount(1);
    await expect(toggle.locator('svg.lucide-wrench')).toHaveCount(0);
    await expectNoToastError(window);
  });

  /* Preconditions: authenticated app with one visible agent and historical code_exec payload without task_summary
     Action: create persisted kind:tool_call with toolName=code_exec and terminal output
     Assertions: legacy persisted payload falls back to title "Code" for backward compatibility
     Exception Rationale (testing.3.13): this test validates renderer behavior for persisted historical
     tool_call(code_exec) data created before the task_summary contract existed.
     Requirements: agents.7.4.6.3, agents.7.4.6.3.1 */
  test('should render fallback Code title for historical code_exec payload without task_summary', async () => {
    await launchWithMockLLM();
    const agentId = (await getAgentIdsFromApi(window))[0];
    expect(agentId).toBeTruthy();

    await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      const result = await api.messages.create(id, 'tool_call', {
        data: {
          callId: 'code-legacy-1',
          toolName: 'code_exec',
          arguments: {
            code: "console.log('legacy')",
            timeout_ms: 10000,
          },
          output: {
            status: 'success',
            stdout: 'legacy\\n',
            stderr: '',
            stdout_truncated: false,
            stderr_truncated: false,
          },
        },
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create historical code_exec tool_call');
      }
    }, agentId as string);

    await expect(window.locator('[data-testid="message-code-exec-block"]').last()).toBeVisible({
      timeout: 5000,
    });
    await expect(window.locator('[data-testid="message-code-exec-toggle"]').last()).toContainText(
      'Code'
    );
    await expectNoToastError(window);
  });

  /* Preconditions: authenticated app with one visible agent
     Action: create persisted kind:tool_call with toolName=code_exec and JavaScript input, then expand collapsed block
     Assertions: code_exec input renders through a single JavaScript code block with syntax label
     Exception Rationale (testing.3.13): this test validates renderer behavior for persisted historical
     tool_call(code_exec) payload and intentionally bypasses LLM transport.
     Requirements: agents.7.4.6 */
  test('should render JavaScript code block in code_exec input section', async () => {
    await launchWithMockLLM();
    const agentId = (await getAgentIdsFromApi(window))[0];
    expect(agentId).toBeTruthy();

    await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      const result = await api.messages.create(id, 'tool_call', {
        data: {
          callId: 'code-highlight-1',
          toolName: 'code_exec',
          arguments: {
            code: 'const answer = 42;\nfunction run() { return answer; }\nconsole.log(run());',
            timeout_ms: 10000,
          },
          output: {
            status: 'success',
            stdout: '42\\n',
            stderr: '',
            stdout_truncated: false,
            stderr_truncated: false,
          },
        },
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create code_exec tool_call');
      }
    }, agentId as string);

    const codeExecBlock = window.locator('[data-testid="message-code-exec-block"]').last();
    await expect(codeExecBlock).toBeVisible({ timeout: 5000 });
    await window.locator('[data-testid="message-code-exec-toggle"]').last().click();

    const inputSection = window.locator('[data-testid="message-code-exec-input"]').last();
    await expect(inputSection).toBeVisible();
    await expect(inputSection.locator('[data-streamdown="code-block-header"]')).toContainText(
      'JavaScript'
    );
    await expect(inputSection).toContainText('const answer = 42;');
    await expect(inputSection.locator('[data-streamdown="code-block"]')).toHaveCount(1);

    await expect(inputSection.locator('pre code')).toHaveCount(1);
    await expect(inputSection.locator('pre code')).toContainText('function run()');
    await expect
      .poll(async () =>
        inputSection.evaluate((element) => {
          const tokenSpans = Array.from(element.querySelectorAll('pre code span'));
          return tokenSpans.some((span) => {
            if (!(span instanceof HTMLElement)) {
              return false;
            }
            const computedColor = getComputedStyle(span).color;
            return computedColor !== '' && computedColor !== 'rgb(0, 0, 0)';
          });
        })
      )
      .toBe(true);
    expect(
      await inputSection.evaluate((element) => {
        const codeBlocks = element.querySelectorAll('[data-streamdown="code-block"]');
        const codeBlock = codeBlocks.item(0) as HTMLElement | null;
        if (!codeBlock) {
          return null;
        }
        if (codeBlocks.length !== 1) {
          return 'multiple';
        }
        const computed = getComputedStyle(element);
        return computed.backgroundColor;
      })
    ).toBe('rgba(0, 0, 0, 0)');
    await expect(inputSection.locator('[data-streamdown="code-block"]')).toHaveCount(1);

    await expectNoToastError(window);
  });

  /* Preconditions: authenticated app with one visible agent
     Action: create persisted kind:tool_call code_exec with long unbroken input/output lines and then create a following llm message
     Assertions: code_exec block stays within chat width and uses internal horizontal scroll for long lines
     Exception Rationale (testing.3.13): this validates renderer layout behavior for persisted historical
     code_exec payload and intentionally bypasses LLM transport.
     Requirements: agents.4.10.1, agents.7.4.6, agents.7.4.9 */
  test('should keep code_exec block within chat width with internal horizontal scroll', async () => {
    await launchWithMockLLM();
    const agentId = (await getAgentIdsFromApi(window))[0];
    expect(agentId).toBeTruthy();

    const longToken = 'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(40);
    const longCode = `const value="${longToken}";\\nconsole.log(value);`;
    const longStdout = `${longToken}\\n${longToken}`;

    await window.evaluate(
      async ({ id, code, stdout }) => {
        const api = (window as unknown as { api: any }).api;
        const result = await api.messages.create(id, 'tool_call', {
          data: {
            callId: 'code-wrap-1',
            toolName: 'code_exec',
            arguments: {
              code,
              timeout_ms: 10000,
            },
            output: {
              status: 'success',
              stdout,
              stderr: '',
              stdout_truncated: false,
              stderr_truncated: false,
            },
          },
        });
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to create code_exec tool_call');
        }

        const llmResult = await api.messages.create(id, 'llm', {
          data: {
            text: `This is a short reply after code_exec.\n\nThe link \`sponsr.ru/goblin/\` appears to show an author page and a publication list.`,
          },
        });
        if (!llmResult?.success) {
          throw new Error(llmResult?.error || 'Failed to create llm message after code_exec');
        }
      },
      { id: agentId as string, code: longCode, stdout: longStdout }
    );

    const codeExecBlock = window.locator('[data-testid="message-code-exec-block"]').last();
    await expect(codeExecBlock).toBeVisible({ timeout: 5000 });
    await window.locator('[data-testid="message-code-exec-toggle"]').last().click();

    const input = window.locator('[data-testid="message-code-exec-input"]').last();
    const stdout = window.locator('[data-testid="message-code-exec-stdout"]').last();

    await expect(input).toBeVisible({ timeout: 5000 });
    await expect(stdout).toContainText(longToken.slice(0, 20));
    await expect(window.locator('[data-testid="message-llm-action"]').last()).toBeVisible({
      timeout: 5000,
    });

    const messagesArea = window.locator('[data-testid="messages-area"]');
    const blockWidth = await codeExecBlock.evaluate((el) => (el as HTMLElement).offsetWidth);
    const messagesAreaLayout = await messagesArea.evaluate((el) => {
      const area = el as HTMLElement;
      return {
        clientWidth: area.clientWidth,
        scrollWidth: area.scrollWidth,
      };
    });
    const inputLayout = await input.evaluate((el) => {
      const inputElement = el as HTMLElement;
      const innerPre = (inputElement.querySelector('pre') ?? inputElement) as HTMLElement;
      const innerCode = innerPre.querySelector('code') ?? innerPre;
      const scrollTarget = innerPre;
      const hasHorizontalScroll = scrollTarget.scrollWidth > scrollTarget.clientWidth + 1;
      const overflowX = window.getComputedStyle(scrollTarget).overflowX;
      const preWhiteSpace = window.getComputedStyle(innerPre as HTMLElement).whiteSpace;
      const codeDisplay = window.getComputedStyle(innerCode as HTMLElement).display;
      return { hasHorizontalScroll, preWhiteSpace, overflowX, codeDisplay };
    });
    const stdoutLayout = await stdout.evaluate((el) => {
      const stdoutElement = el as HTMLElement;
      const innerPre =
        stdoutElement.querySelector('[data-streamdown="code-block-body"] pre') ??
        stdoutElement.querySelector('pre');
      const scrollTarget = (innerPre as HTMLElement | null) ?? stdoutElement;
      const hasHorizontalScroll = scrollTarget.scrollWidth > scrollTarget.clientWidth + 1;
      const whiteSpace = window.getComputedStyle(scrollTarget).whiteSpace;
      const overflowX = window.getComputedStyle(scrollTarget).overflowX;
      return { hasHorizontalScroll, whiteSpace, overflowX };
    });
    expect(blockWidth).toBeLessThanOrEqual(messagesAreaLayout.clientWidth + 1);
    expect(messagesAreaLayout.scrollWidth).toBeLessThanOrEqual(messagesAreaLayout.clientWidth + 1);
    expect(inputLayout.hasHorizontalScroll).toBe(true);
    expect(inputLayout.preWhiteSpace).toBe('pre');
    expect(['visible', 'auto', 'scroll']).toContain(inputLayout.overflowX);
    expect(['block', 'inline']).toContain(inputLayout.codeDisplay);
    expect(stdoutLayout.hasHorizontalScroll).toBe(true);
    expect(stdoutLayout.whiteSpace).toBe('pre');
    expect(['auto', 'scroll']).toContain(stdoutLayout.overflowX);

    await expectNoToastError(window);
  });

  /* Preconditions: authenticated app
     Action: create done code_exec tool_call as last message
     Assertions: agent status remains in-progress (not completed/error)
     Requirements: agents.9.2 */
  test('should keep in-progress status for done tool_call(code_exec)', async () => {
    await launchWithMockLLM();
    const agentId = (await getAgentIdsFromApi(window))[0];
    expect(agentId).toBeTruthy();

    await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      const result = await api.messages.create(id, 'tool_call', {
        data: {
          callId: 'code-2',
          toolName: 'code_exec',
          arguments: { task_summary: 'Run code', code: '1+1' },
          output: {
            status: 'error',
            stdout: '',
            stderr: '',
            stdout_truncated: false,
            stderr_truncated: false,
            error: { code: 'policy_denied', message: 'x' },
          },
        },
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create code_exec tool_call');
      }
    }, agentId as string);

    const headerStatus = window.locator('[data-testid="agent-status-text"]').first();
    await expect(headerStatus).toBeVisible({ timeout: 5000 });
    await expect(headerStatus).toHaveText('In progress');
    await expectNoToastError(window);
  });
});

test.describe('code_exec tool loop execution', () => {
  /* Preconditions: mock model emits code_exec that calls tools.http_request against a local JSON endpoint
     Action: user sends a message that triggers sandbox http_request helper
     Assertions: helper response is returned to sandbox code as structured metadata with textual body
     Requirements: sandbox-http-request.1.1, sandbox-http-request.1.3, sandbox-http-request.2.1, sandbox-http-request.3.4 */
  test('should allow sandbox code to execute async http_request helper', async () => {
    const port = await getFreePort();
    const requests: Array<{ method?: string; accept?: string }> = [];
    const localServer = http.createServer((req, res) => {
      requests.push({ method: req.method, accept: req.headers.accept });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, source: 'local-server' }));
    });
    await new Promise<void>((resolve) => localServer.listen(port, '127.0.0.1', () => resolve()));

    try {
      mockLLMServer.setStreamingMode(true);
      mockLLMServer.setOpenAIStreamScripts([
        {
          toolCalls: [
            {
              callId: 'http-ok-1',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Fetch local JSON',
                code: `const result = await tools.http_request({
  url: "http://127.0.0.1:${port}/data",
  method: "GET",
  headers: { "accept": "application/json" },
  timeout_ms: 10000
});
console.log(JSON.stringify(result));`,
                timeout_ms: 10000,
              },
            },
          ],
        },
        {
          content: '{"action":{"type":"text","content":"http helper done"}}',
        },
      ]);

      await launchWithMockLLM();
      await sendUserMessage('Fetch local JSON via http helper');
      await expect(window.locator('.message-llm-action-response').last()).toContainText(
        'http helper done',
        {
          timeout: 15000,
        }
      );

      const agentId = (await getAgentIdsFromApi(window))[0];
      const output = await getCodeExecOutputByCallId(agentId, 'http-ok-1');
      expect(output).toBeDefined();
      expect(output?.status).toBe('success');
      const stdout = typeof output?.stdout === 'string' ? output.stdout.trim() : '';
      const payload = JSON.parse(stdout) as Record<string, unknown>;
      expect(payload).toMatchObject({
        status: 200,
        final_url: `http://127.0.0.1:${port}/data`,
        content_type: 'application/json; charset=utf-8',
        body_encoding: 'text',
        truncated: false,
      });
      expect(String(payload.body)).toContain('"ok":true');
      expect(requests).toEqual([{ method: 'GET', accept: 'application/json' }]);
      await expectNoToastError(window);
    } finally {
      await new Promise<void>((resolve) => localServer.close(() => resolve()));
    }
  });

  /* Preconditions: mock model emits code_exec that calls tools.http_request with follow_redirects disabled
     Action: user sends a message that triggers sandbox http_request helper
     Assertions: helper returns the redirect response without following the Location target
     Requirements: sandbox-http-request.2.8, sandbox-http-request.3.3.3 */
  test('should return redirect response without following in http_request helper', async () => {
    const port = await getFreePort();
    let finalRequestCount = 0;
    const localServer = http.createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/final` });
        res.end('');
        return;
      }

      if (req.url === '/final') {
        finalRequestCount += 1;
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('final');
        return;
      }

      res.writeHead(404);
      res.end('missing');
    });
    await new Promise<void>((resolve) => localServer.listen(port, '127.0.0.1', () => resolve()));

    try {
      mockLLMServer.setStreamingMode(true);
      mockLLMServer.setOpenAIStreamScripts([
        {
          toolCalls: [
            {
              callId: 'http-redirect-1',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Inspect redirect response',
                code: `const result = await tools.http_request({
  url: "http://127.0.0.1:${port}/redirect",
  follow_redirects: false
});
console.log(JSON.stringify(result));`,
                timeout_ms: 10000,
              },
            },
          ],
        },
        {
          content: '{"action":{"type":"text","content":"redirect helper done"}}',
        },
      ]);

      await launchWithMockLLM();
      await sendUserMessage('Fetch redirect without following');
      await expect(window.locator('.message-llm-action-response').last()).toContainText(
        'redirect helper done',
        {
          timeout: 15000,
        }
      );

      const agentId = (await getAgentIdsFromApi(window))[0];
      const output = await getCodeExecOutputByCallId(agentId, 'http-redirect-1');
      const stdout = typeof output?.stdout === 'string' ? output.stdout.trim() : '';
      const payload = JSON.parse(stdout) as Record<string, unknown>;
      expect(payload).toMatchObject({
        status: 302,
        final_url: `http://127.0.0.1:${port}/redirect`,
        truncated: false,
      });
      expect(finalRequestCount).toBe(0);
      await expectNoToastError(window);
    } finally {
      await new Promise<void>((resolve) => localServer.close(() => resolve()));
    }
  });

  /* Preconditions: mock model emits code_exec that calls tools.http_request against a binary endpoint with explicit byte limit
     Action: user sends a message that triggers sandbox http_request helper
     Assertions: helper truncates the binary response by bytes and returns base64-encoded body metadata
     Requirements: sandbox-http-request.2.9, sandbox-http-request.2.10, sandbox-http-request.3.4.6, sandbox-http-request.3.5, sandbox-http-request.3.6 */
  test('should enforce max_response_bytes and base64 encoding in http_request helper', async () => {
    const port = await getFreePort();
    const binaryBody = Buffer.from([0, 1, 2, 3, 4, 5]);
    const localServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(binaryBody);
    });
    await new Promise<void>((resolve) => localServer.listen(port, '127.0.0.1', () => resolve()));

    try {
      mockLLMServer.setStreamingMode(true);
      mockLLMServer.setOpenAIStreamScripts([
        {
          toolCalls: [
            {
              callId: 'http-bin-1',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Fetch binary payload',
                code: `const result = await tools.http_request({
  url: "http://127.0.0.1:${port}/bin",
  max_response_bytes: 4
});
console.log(JSON.stringify(result));`,
                timeout_ms: 10000,
              },
            },
          ],
        },
        {
          content: '{"action":{"type":"text","content":"binary helper done"}}',
        },
      ]);

      await launchWithMockLLM();
      await sendUserMessage('Fetch binary content via http helper');
      await expect(window.locator('.message-llm-action-response').last()).toContainText(
        'binary helper done',
        {
          timeout: 15000,
        }
      );

      const agentId = (await getAgentIdsFromApi(window))[0];
      const output = await getCodeExecOutputByCallId(agentId, 'http-bin-1');
      const stdout = typeof output?.stdout === 'string' ? output.stdout.trim() : '';
      const payload = JSON.parse(stdout) as Record<string, unknown>;
      expect(payload).toMatchObject({
        status: 200,
        body_encoding: 'base64',
        truncated: true,
        applied_limit_bytes: 4,
      });
      expect(payload.body).toBe(Buffer.from(binaryBody.subarray(0, 4)).toString('base64'));
      await expectNoToastError(window);
    } finally {
      await new Promise<void>((resolve) => localServer.close(() => resolve()));
    }
  });

  /* Preconditions: mock model emits code_exec that calls tools.http_request with invalid helper arguments and then with an unreachable target
     Action: user sends two messages that trigger sandbox http_request helper
     Assertions: helper returns structured validation and runtime errors to sandbox code without breaking the chat flow
     Requirements: sandbox-http-request.4.1, sandbox-http-request.4.2 */
  test('should return structured validation and runtime errors from http_request helper', async () => {
    const unreachablePort = await getFreePort();

    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'http-invalid-1',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Validate helper input',
              code: `const result = await tools.http_request({
  url: "https://example.com",
  method: "TRACE"
});
console.log(JSON.stringify(result));`,
              timeout_ms: 10000,
            },
          },
        ],
      },
      {
        content: '{"action":{"type":"text","content":"invalid helper done"}}',
      },
      {
        toolCalls: [
          {
            callId: 'http-runtime-1',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Handle fetch failure',
              code: `const result = await tools.http_request({
  url: "http://127.0.0.1:${unreachablePort}/unreachable",
  timeout_ms: 10000
});
console.log(JSON.stringify(result));`,
              timeout_ms: 10000,
            },
          },
        ],
      },
      {
        content: '{"action":{"type":"text","content":"runtime helper done"}}',
      },
    ]);

    await launchWithMockLLM();

    await sendUserMessage('Return invalid helper error');
    await expect(window.locator('.message-llm-action-response').last()).toContainText(
      'invalid helper done',
      {
        timeout: 15000,
      }
    );

    const agentId = (await getAgentIdsFromApi(window))[0];
    const invalidOutput = await getCodeExecOutputByCallId(agentId, 'http-invalid-1');
    const invalidStdout =
      typeof invalidOutput?.stdout === 'string' ? invalidOutput.stdout.trim() : '';
    const invalidPayload = JSON.parse(invalidStdout) as Record<string, unknown>;
    expect(invalidPayload).toMatchObject({
      error: { code: 'invalid_method' },
    });

    await sendUserMessage('Return runtime helper error');
    await expect(window.locator('.message-llm-action-response').last()).toContainText(
      'runtime helper done',
      {
        timeout: 15000,
      }
    );

    const runtimeOutput = await getCodeExecOutputByCallId(agentId, 'http-runtime-1');
    const runtimeStdout =
      typeof runtimeOutput?.stdout === 'string' ? runtimeOutput.stdout.trim() : '';
    const runtimePayload = JSON.parse(runtimeStdout) as Record<string, unknown>;
    expect(runtimePayload).toMatchObject({
      error: { code: 'fetch_failed' },
    });
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits code_exec that calls tools.http_request against localhost while a loopback server is listening
     Action: user sends a message that triggers sandbox http_request helper
     Assertions: helper rejects localhost as forbidden_destination and no request reaches the local server
     Requirements: sandbox-http-request.2.3.1, sandbox-http-request.4.2.2 */
  test('should reject localhost http_request target before any request is sent', async () => {
    const port = await getFreePort();
    let requestCount = 0;
    const localServer = http.createServer((_req, res) => {
      requestCount += 1;
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('should not be reached');
    });
    await new Promise<void>((resolve) => localServer.listen(port, '127.0.0.1', () => resolve()));

    try {
      mockLLMServer.setStreamingMode(true);
      mockLLMServer.setOpenAIStreamScripts([
        {
          toolCalls: [
            {
              callId: 'http-localhost-block-1',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Reject localhost target',
                code: `const result = await tools.http_request({
  url: "http://localhost:${port}/blocked",
  timeout_ms: 10000
});
console.log(JSON.stringify(result));`,
                timeout_ms: 10000,
              },
            },
          ],
        },
        {
          content: '{"action":{"type":"text","content":"localhost helper blocked"}}',
        },
      ]);

      await launchWithMockLLM();
      await sendUserMessage('Try localhost via http helper');
      await expect(window.locator('.message-llm-action-response').last()).toContainText(
        'localhost helper blocked',
        {
          timeout: 15000,
        }
      );

      const agentId = (await getAgentIdsFromApi(window))[0];
      const output = await getCodeExecOutputByCallId(agentId, 'http-localhost-block-1');
      const denied = await findCodeExecCallByCallId(agentId, 'http-localhost-block-1');
      const helperResult = JSON.parse(output?.stdout ?? '{}') as {
        error?: { code?: string; message?: string };
      };
      expect(denied?.payload?.data?.output?.status).toBe('success');
      expect(helperResult.error?.code).toBe('forbidden_destination');
      expect(String(helperResult.error?.message)).toContain('localhost');
      expect(requestCount).toBe(0);
      await expectNoToastError(window);
    } finally {
      await new Promise<void>((resolve) => localServer.close(() => resolve()));
    }
  });

  /* Preconditions: mock model repeatedly emits invalid code_exec args
     Action: user sends a message that triggers code_exec calls
     Assertions: invalid call is not persisted as terminal code_exec result; turn ends with persisted kind:error for the same turn
     Requirements: code_exec.5.1.4, code_exec.5.1.5, code_exec.6.3 */
  test('should not persist any code_exec tool_call for invalid arguments', async () => {
    mockLLMServer.setStreamingMode(true);
    const invalidScripts = Array.from({ length: 20 }, (_, index) => ({
      toolCalls: [{ callId: `bad-${index + 1}`, toolName: 'code_exec', arguments: {} }],
    }));
    mockLLMServer.setOpenAIStreamScripts(invalidScripts);

    await launchWithMockLLM();
    const promptText = 'Run JavaScript (invalid args)';
    await sendUserMessage(promptText);

    const requestCount = mockLLMServer
      .getRequestLogs()
      .filter((entry) => entry.path === '/v1/responses').length;
    expect(requestCount).toBeGreaterThanOrEqual(1);

    const agentId = (await getAgentIdsFromApi(window))[0];
    const toolCalls = await getToolCallMessages(agentId);
    const codeExecToolCalls = toolCalls.filter((entry) => {
      const payload = entry.payload as {
        data?: { toolName?: string; output?: { status?: string } };
      };
      return payload?.data?.toolName === 'code_exec';
    });
    expect(codeExecToolCalls).toHaveLength(0);

    await expect
      .poll(async () => {
        const messages = await getAllMessages(agentId);
        const latestUser = [...messages].reverse().find((entry) => {
          const payload = entry.payload as { data?: { text?: string } };
          return entry.kind === 'user' && payload?.data?.text === promptText;
        }) as { id?: number } | undefined;
        return typeof latestUser?.id === 'number' ? latestUser.id : -1;
      })
      .toBeGreaterThan(0);
    const allMessagesAfterUserTurn = await getAllMessages(agentId);
    const userTurnMessage = [...allMessagesAfterUserTurn].reverse().find((entry) => {
      const payload = entry.payload as { data?: { text?: string } };
      return entry.kind === 'user' && payload?.data?.text === promptText;
    }) as { id?: number } | undefined;
    const userMessageId = userTurnMessage?.id;
    expect(typeof userMessageId).toBe('number');

    await expect
      .poll(async () => {
        const messages = await getAllMessages(agentId);
        return messages.filter((entry) => entry.kind === 'error').length;
      })
      .toBeGreaterThanOrEqual(1);

    await expect
      .poll(async () => {
        const messages = await getAllMessages(agentId);
        return messages.filter(
          (entry) => entry.kind === 'error' && entry.replyToMessageId === (userMessageId as number)
        ).length;
      })
      .toBeGreaterThanOrEqual(1);

    const allMessages = await getAllMessages(agentId);
    const persistedTurnError = [...allMessages]
      .reverse()
      .find(
        (entry) => entry.kind === 'error' && entry.replyToMessageId === (userMessageId as number)
      ) as { done?: boolean; payload?: { data?: { error?: { message?: string } } } } | undefined;
    expect(persistedTurnError).toBeDefined();
    expect(persistedTurnError?.done).toBe(true);
    expect(persistedTurnError?.payload?.data?.error?.message ?? '').toContain(
      'Model returned invalid tool call arguments too many times.'
    );
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits code_exec call with code >30KiB
     Action: user sends a message
     Assertions: oversized payload is validated into invalid_tool_arguments with explicit 30KiB limit text
     Requirements: code_exec.5.1.1, code_exec.5.1.3 */
  test('should enforce code size limit for code_exec arguments', async () => {
    const oversizedCode = 'x'.repeat(31 * 1024);
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'big-1',
            toolName: 'code_exec',
            arguments: { task_summary: 'Run oversized code', code: oversizedCode },
          },
        ],
      },
      {
        toolCalls: [
          {
            callId: 'big-2',
            toolName: 'code_exec',
            arguments: { task_summary: 'Run oversized code', code: oversizedCode },
          },
        ],
      },
      {
        toolCalls: [
          {
            callId: 'big-3',
            toolName: 'code_exec',
            arguments: { task_summary: 'Run oversized code', code: oversizedCode },
          },
        ],
      },
    ]);

    await launchWithMockLLM();
    const promptText = 'Run huge code';
    await sendUserMessage(promptText);

    const requestCount = mockLLMServer
      .getRequestLogs()
      .filter((entry) => entry.path === '/v1/responses').length;
    expect(requestCount).toBeGreaterThanOrEqual(1);

    const agentId = (await getAgentIdsFromApi(window))[0];
    const allMessages = await getAllMessages(agentId);
    const userTurnMessage = [...allMessages].reverse().find((entry) => {
      const payload = entry.payload as { data?: { text?: string } };
      return entry.kind === 'user' && payload?.data?.text === promptText;
    }) as { id?: number } | undefined;
    const userMessageId = userTurnMessage?.id;
    expect(typeof userMessageId).toBe('number');

    const requests = mockLLMServer
      .getRequestLogs()
      .filter((entry) => entry.path === '/v1/responses');
    const serializedRequests = requests.map((entry) => JSON.stringify(entry.body));
    expect(
      serializedRequests.some((dump) =>
        dump.includes('code_exec.code exceeds limit 30720 bytes (30 KiB).')
      )
    ).toBe(true);
    expect(serializedRequests.some((dump) => dump.includes('invalid_tool_arguments'))).toBe(true);

    const hasSuccessCodeExec = (await getToolCallMessages(agentId)).some((entry) => {
      const payload = entry.payload as {
        data?: { toolName?: string; output?: { status?: string } };
      };
      return payload?.data?.toolName === 'code_exec' && payload?.data?.output?.status === 'success';
    });
    expect(hasSuccessCodeExec).toBe(false);
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits code_exec call that writes large stdout/stderr then finishes
     Action: user sends a message
     Assertions: terminal code_exec output sets truncation flags for both streams
     Requirements: code_exec.5.2.2, code_exec.5.2.3, code_exec.5.2.4 */
  test('should apply stdout/stderr truncation limits and flags', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'trunc-1',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Generate large stdout and stderr',
              code: "console.log('o'.repeat(16000)); console.error('e'.repeat(16000));",
              timeout_ms: 10000,
            },
          },
        ],
      },
      {
        content: '{"action":{"type":"text","content":"done"}}',
      },
    ]);

    await launchWithMockLLM();
    await sendUserMessage('Produce a lot of output');
    await expect(window.locator('.message-llm-action-response').last()).toBeVisible({
      timeout: 15000,
    });

    const agentId = (await getAgentIdsFromApi(window))[0];
    const codeExec = await findCodeExecCallByCallId(agentId, 'trunc-1');
    expect(codeExec).toBeDefined();

    const output = codeExec?.payload?.data?.output as Record<string, unknown> | undefined;
    expect(output?.stdout_truncated).toBe(true);
    expect(output?.stderr_truncated).toBe(true);
    expect(typeof output?.stdout).toBe('string');
    expect(typeof output?.stderr).toBe('string');
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits two sequential code_exec calls across model->tool->model steps in one turn and then final text
     Action: user sends a message
     Assertions: two terminal code_exec messages are persisted and correlated by callId
     Requirements: code_exec.5.3 */
  test('should support multiple code_exec calls in one turn with callId correlation', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'parallel-a',
            toolName: 'code_exec',
            arguments: { task_summary: 'Run code', code: "console.log('A')", timeout_ms: 10000 },
          },
        ],
      },
      {
        toolCalls: [
          {
            callId: 'parallel-b',
            toolName: 'code_exec',
            arguments: { task_summary: 'Run code', code: "console.log('B')", timeout_ms: 10000 },
          },
        ],
      },
      {
        content: '{"action":{"type":"text","content":"parallel done"}}',
      },
    ]);

    await launchWithMockLLM();
    await sendUserMessage('Run two code blocks');
    await expect(window.locator('.message-llm-action-response').last()).toContainText(
      'parallel done',
      {
        timeout: 15000,
      }
    );

    const agentId = (await getAgentIdsFromApi(window))[0];
    const toolCalls = await getToolCallMessages(agentId);
    const codeExecCalls = toolCalls.filter((entry) => {
      const payload = entry.payload as { data?: { toolName?: string } };
      return payload?.data?.toolName === 'code_exec';
    }) as Array<{
      payload?: {
        data?: {
          callId?: string;
          output?: { status?: string; stdout?: string };
        };
      };
    }>;
    expect(codeExecCalls.length).toBeGreaterThanOrEqual(2);
    const callIds = codeExecCalls.map((entry) => entry.payload?.data?.callId);
    expect(callIds).toContain('parallel-a');
    expect(callIds).toContain('parallel-b');

    const byCallId = new Map<string, (typeof codeExecCalls)[number]>();
    for (const entry of codeExecCalls) {
      const callId = entry.payload?.data?.callId;
      if (callId) byCallId.set(callId, entry);
    }
    expect(byCallId.get('parallel-a')?.payload?.data?.output?.status).toBe('success');
    expect(byCallId.get('parallel-a')?.payload?.data?.output?.stdout ?? '').toContain('A');
    expect(byCallId.get('parallel-b')?.payload?.data?.output?.status).toBe('success');
    expect(byCallId.get('parallel-b')?.payload?.data?.output?.stdout ?? '').toContain('B');
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits one successful code_exec call and then final text
     Action: user sends a message
     Assertions: persisted terminal payload contains monotonic audit fields started_at/finished_at/duration_ms
     Requirements: code_exec.4.7 */
  test('should persist lifecycle audit fields for terminal code_exec', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'audit-1',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Run code',
              code: "console.log('audit')",
              timeout_ms: 10000,
            },
          },
        ],
      },
      {
        content: '{"action":{"type":"text","content":"audit done"}}',
      },
    ]);

    await launchWithMockLLM();
    await sendUserMessage('Run one code block with audit');
    await expect(window.locator('.message-llm-action-response').last()).toContainText(
      'audit done',
      {
        timeout: 15000,
      }
    );

    const agentId = (await getAgentIdsFromApi(window))[0];
    const toolCalls = await getToolCallMessages(agentId);
    const codeExec = toolCalls.find((entry) => {
      const payload = entry.payload as { data?: { callId?: string; toolName?: string } };
      return payload?.data?.toolName === 'code_exec' && payload?.data?.callId === 'audit-1';
    }) as
      | {
          payload?: {
            data?: {
              output?: {
                started_at?: string;
                finished_at?: string;
                duration_ms?: number;
              };
            };
          };
        }
      | undefined;
    expect(codeExec).toBeDefined();

    const output = codeExec?.payload?.data?.output;
    expect(typeof output?.started_at).toBe('string');
    expect(typeof output?.finished_at).toBe('string');
    expect(typeof output?.duration_ms).toBe('number');
    const startedAtMs = Date.parse(output?.started_at ?? '');
    const finishedAtMs = Date.parse(output?.finished_at ?? '');
    expect(Number.isNaN(startedAtMs)).toBe(false);
    expect(Number.isNaN(finishedAtMs)).toBe(false);
    expect(finishedAtMs).toBeGreaterThanOrEqual(startedAtMs);
    expect((output?.duration_ms ?? -1) >= 0).toBe(true);
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits code_exec call that tries window.open on local http server
     Action: user sends a message
     Assertions: terminal policy_denied is returned and no outgoing request reaches local server
     Requirements: code_exec.2.3.1, code_exec.2.3.2 */
  test('should return policy_denied for window.open and perform no network request', async () => {
    const port = await getFreePort();
    let requestCount = 0;
    const localServer = http.createServer((_req, res) => {
      requestCount += 1;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
    await new Promise<void>((resolve) => localServer.listen(port, resolve));

    try {
      mockLLMServer.setStreamingMode(true);
      mockLLMServer.setOpenAIStreamScripts([
        {
          toolCalls: [
            {
              callId: 'net-1',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Try opening URL',
                code: `window.open('http://127.0.0.1:${port}/egress-check')`,
                timeout_ms: 10000,
              },
            },
          ],
        },
        {
          content: '{"action":{"type":"text","content":"done"}}',
        },
      ]);

      await launchWithMockLLM();
      await sendUserMessage('Try opening URL');
      await expect(window.locator('.message-llm-action-response').last()).toBeVisible({
        timeout: 15000,
      });

      const agentId = (await getAgentIdsFromApi(window))[0];
      const codeExec = await findCodeExecCallByCallId(agentId, 'net-1');

      expect(codeExec).toBeDefined();
      expect(codeExec?.payload?.data?.output?.error?.code).toBe('policy_denied');
      expect(requestCount).toBe(0);
      await expectNoToastError(window);
    } finally {
      await new Promise<void>((resolve) => localServer.close(() => resolve()));
    }
  });

  /* Preconditions: local server tracks incoming requests, mock model emits location.assign/replace in code_exec
     Action: user sends a message that triggers navigation APIs inside sandbox runtime
     Assertions: terminal result is policy_denied and no outbound request reaches local server
     Requirements: code_exec.2.3.1, code_exec.2.3.2, code_exec.2.4 */
  test('should return policy_denied for location.assign/replace and perform no network request', async () => {
    const port = await getFreePort();
    let requestCount = 0;
    const localServer = http.createServer((_req, res) => {
      requestCount += 1;
      res.statusCode = 200;
      res.end('ok');
    });
    await new Promise<void>((resolve) => localServer.listen(port, '127.0.0.1', () => resolve()));

    try {
      mockLLMServer.setStreamingMode(true);
      mockLLMServer.setOpenAIStreamScripts([
        {
          toolCalls: [
            {
              callId: 'deny-location-assign',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Try location.assign',
                code: `location.assign('http://127.0.0.1:${port}/egress-check-assign')`,
                timeout_ms: 10000,
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              callId: 'deny-location-replace',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Try location.replace',
                code: `location.replace('http://127.0.0.1:${port}/egress-check-replace')`,
                timeout_ms: 10000,
              },
            },
          ],
        },
        {
          content: '{"action":{"type":"text","content":"done"}}',
        },
      ]);

      await launchWithMockLLM();
      await sendUserMessage('Try location navigation APIs');
      await expect(window.locator('.message-llm-action-response').last()).toBeVisible({
        timeout: 15000,
      });

      const agentId = (await getAgentIdsFromApi(window))[0];
      const assignDenied = await findCodeExecCallByCallId(agentId, 'deny-location-assign');
      const replaceDenied = await findCodeExecCallByCallId(agentId, 'deny-location-replace');
      expect(assignDenied).toBeDefined();
      expect(replaceDenied).toBeDefined();
      expect(assignDenied?.payload?.data?.output?.error?.code).toBe('policy_denied');
      expect(replaceDenied?.payload?.data?.output?.error?.code).toBe('policy_denied');
      expect(requestCount).toBe(0);
      await expectNoToastError(window);
    } finally {
      await new Promise<void>((resolve) => localServer.close(() => resolve()));
    }
  });

  /* Preconditions: local server tracks incoming requests, mock model emits fetch/xhr/websocket/sendBeacon in separate code_exec calls
     Action: user sends a message that triggers browser-level network APIs inside sandbox runtime
     Assertions: each terminal result is policy_denied and no outbound request reaches local server
     Requirements: code_exec.2.3.1, code_exec.2.3.2 */
  test('should deny fetch/xhr/websocket/sendBeacon and perform no network request', async () => {
    const port = await getFreePort();
    let requestCount = 0;
    const localServer = http.createServer((_req, res) => {
      requestCount += 1;
      res.statusCode = 200;
      res.end('ok');
    });
    await new Promise<void>((resolve) => localServer.listen(port, '127.0.0.1', () => resolve()));

    try {
      mockLLMServer.setStreamingMode(true);
      mockLLMServer.setOpenAIStreamScripts([
        {
          toolCalls: [
            {
              callId: 'deny-fetch',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Deny fetch API call',
                code: `await fetch('http://127.0.0.1:${port}/fetch-blocked')`,
                timeout_ms: 10000,
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              callId: 'deny-xhr',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Deny XMLHttpRequest call',
                code: `const xhr = new XMLHttpRequest(); xhr.open('GET', 'http://127.0.0.1:${port}/xhr-blocked', true); xhr.send();`,
                timeout_ms: 10000,
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              callId: 'deny-websocket',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Deny WebSocket call',
                code: `new WebSocket('ws://127.0.0.1:${port}/ws-blocked')`,
                timeout_ms: 10000,
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              callId: 'deny-sendbeacon',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Deny sendBeacon call',
                code: `navigator.sendBeacon('http://127.0.0.1:${port}/beacon-blocked', 'x')`,
                timeout_ms: 10000,
              },
            },
          ],
        },
        {
          content: '{"action":{"type":"text","content":"network APIs denied"}}',
        },
      ]);

      await launchWithMockLLM();
      await sendUserMessage('Try browser-level network APIs');
      await expect(window.locator('.message-llm-action-response').last()).toContainText(
        'network APIs denied',
        {
          timeout: 15000,
        }
      );

      const agentId = (await getAgentIdsFromApi(window))[0];
      const callIds = ['deny-fetch', 'deny-xhr', 'deny-websocket', 'deny-sendbeacon'];
      for (const callId of callIds) {
        const denied = await findCodeExecCallByCallId(agentId, callId);
        expect(denied).toBeDefined();
        expect(denied?.payload?.data?.output?.error?.code).toBe('policy_denied');
      }
      expect(requestCount).toBe(0);
      await expectNoToastError(window);
    } finally {
      await new Promise<void>((resolve) => localServer.close(() => resolve()));
    }
  });

  /* Preconditions: first request finishes with terminal code_exec tool result, second request is sent
     Action: user sends two messages sequentially
     Assertions: second provider request includes terminal code_exec tool-result in model history
     Requirements: code_exec.4.5.1, llm-integration.11.3.1 */
  test('should include terminal code_exec tool result in subsequent model history', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'hist-1',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Run code',
              code: "console.log('history')",
              timeout_ms: 10000,
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            callId: 'hist-final-1',
            toolName: 'final_answer',
            arguments: {
              summary_points: ['first done'],
            },
          },
        ],
      },
    ]);

    await launchWithMockLLM();
    await sendUserMessage('First run with code tool');
    await expect(window.locator('[data-testid="message-final-answer-block"]').last()).toBeVisible({
      timeout: 15000,
    });

    mockLLMServer.setOpenAIStreamScripts([
      {
        content: '{"action":{"type":"text","content":"second done"}}',
      },
    ]);

    await sendUserMessage('Second turn after code_exec');
    await expect(window.locator('.message-llm-action-response').last()).toContainText(
      'second done',
      {
        timeout: 15000,
      }
    );
    await expect
      .poll(async () => {
        const agentId = (await getAgentIdsFromApi(window))[0];
        const messages = await getAllMessages(agentId);
        const hasSecondUser = messages.some((entry) => {
          const payload = entry.payload as { data?: { text?: string } };
          return entry.kind === 'user' && payload?.data?.text === 'Second turn after code_exec';
        });
        const hasProviderError = messages.some((entry) => {
          const payload = entry.payload as { data?: { error?: { type?: string } } };
          return entry.kind === 'error' && payload?.data?.error?.type === 'provider';
        });
        return hasSecondUser && !hasProviderError;
      })
      .toBe(true);

    await expect
      .poll(
        () =>
          mockLLMServer.getRequestLogs().filter((entry) => entry.path === '/v1/responses').length,
        { timeout: 15000 }
      )
      .toBeGreaterThanOrEqual(3);

    const requests = mockLLMServer
      .getRequestLogs()
      .filter((entry) => entry.path === '/v1/responses');
    const subsequentRequest = requests[2];
    expect(subsequentRequest).toBeDefined();
    const requestDump = JSON.stringify(subsequentRequest?.body);
    expect(requestDump).toContain('code_exec');
    expect(requestDump).toContain('hist-1');
    expect(requestDump).toContain('success');
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits long-running code_exec with explicit timeout, then next model response
     Action: user sends a message
     Assertions: terminal code_exec carries limit_exceeded timeout signal and pipeline continues to next model step
     Requirements: code_exec.2.5, code_exec.3.1.2.6, code_exec.5.6, code_exec.6.3 */
  test('should timeout long-running code_exec execution and continue loop', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'timeout-1',
            toolName: 'code_exec',
            arguments: { task_summary: 'Run code', code: 'while (true) {}', timeout_ms: 10000 },
          },
        ],
      },
      {
        content: '{"action":{"type":"text","content":"timeout recovered"}}',
      },
    ]);

    await launchWithMockLLM();
    await sendUserMessage('Run code with timeout');
    await expect(window.locator('.message-llm-action-response').last()).toContainText(
      'timeout recovered',
      { timeout: 20000 }
    );

    const agentId = (await getAgentIdsFromApi(window))[0];
    const timeoutCall = await findCodeExecCallByCallId(agentId, 'timeout-1');
    expect(timeoutCall?.payload?.data?.output?.error?.code).toBe('limit_exceeded');
    expect(timeoutCall?.payload?.data?.output?.error?.message ?? '').toContain('timeout');
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits memory-heavy code_exec and then next model response
     Action: user sends a message
     Assertions: terminal code_exec returns limit_exceeded with RAM limit diagnostic and pipeline continues
     Requirements: code_exec.2.11.3, code_exec.3.1.2.3.1, code_exec.6.3 */
  test('should return limit_exceeded for memory-heavy code_exec and continue loop', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'memory-1',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Run code',
              code: "const huge = 'x'.repeat(2 ** 31); console.log(huge.length);",
            },
          },
        ],
      },
      {
        content: '{"action":{"type":"text","content":"memory handled"}}',
      },
    ]);

    await launchWithMockLLM();
    await sendUserMessage('Run memory heavy code');
    await expect(window.locator('.message-llm-action-response').last()).toContainText(
      'memory handled',
      { timeout: 20000 }
    );

    const agentId = (await getAgentIdsFromApi(window))[0];
    const memoryCall = await findCodeExecCallByCallId(agentId, 'memory-1');
    expect(memoryCall?.payload?.data?.output?.error?.code).toBe('limit_exceeded');
    expect(memoryCall?.payload?.data?.output?.error?.message ?? '').toContain('2 GiB');
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits CPU-intensive finite code_exec that can finish under timeout
     Action: user sends a message
     Assertions: execution completes without forced terminal failure; if degraded mode is applied, stderr contains diagnostic warning
     Requirements: code_exec.2.11.2 */
  test('should execute finite CPU pressure scenario without forced terminal failure', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'degraded-1',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Run CPU intensive finite loop',
              code: "const start = Date.now(); while (Date.now() - start < 2500) {} console.log('degraded done');",
              timeout_ms: 10000,
            },
          },
        ],
      },
      {
        content: '{"action":{"type":"text","content":"degraded handled"}}',
      },
    ]);

    await launchWithMockLLM();
    await sendUserMessage('Run CPU intensive code');
    await expect(window.locator('.message-llm-action-response').last()).toBeVisible({
      timeout: 20000,
    });

    const agentId = (await getAgentIdsFromApi(window))[0];
    const degradedCall = await findCodeExecCallByCallId(agentId, 'degraded-1');
    const output = degradedCall?.payload?.data?.output;
    expect(output).toBeDefined();
    if (output?.status === 'success') {
      expect(output?.error).toBeUndefined();
      if ((output?.stderr ?? '').length > 0) {
        expect(output?.stderr ?? '').toContain('Execution continued in degraded mode');
      }
    } else {
      expect(output?.status).toBe('error');
      expect(output?.error?.code).toBe('limit_exceeded');
    }
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits non-terminating code_exec call
     Action: user sends a message and triggers stop/cancel flow
     Assertions: cancel IPC request succeeds and no kind:error is persisted for this turn
     Requirements: code_exec.2.6, code_exec.3.1.2.4, code_exec.3.1.2.7, code_exec.4.5, code_exec.6.3 */
  test('should cancel active code_exec execution without persisting kind:error', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'cancel-1',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Run cancellable infinite promise',
              code: 'await new Promise(() => {});',
              timeout_ms: 60000,
            },
          },
        ],
      },
    ]);

    await launchWithMockLLM();
    const promptText = 'Start cancellable code_exec';
    await sendUserMessage(promptText);

    const agentId = (await getAgentIdsFromApi(window))[0];
    await expect(window.locator('[data-testid="prompt-input-stop"]')).toBeVisible({
      timeout: 15000,
    });

    await window.locator('[data-testid="prompt-input-stop"]').click();
    const cancelResult = await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      return await api.messages.cancel(id);
    }, agentId as string);
    expect(cancelResult?.success).toBe(true);
    await expect(window.locator('[data-testid="prompt-input-stop"]')).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(
      window.locator('[data-testid="message-code-exec-status-icon"][data-status="running"]')
    ).toHaveCount(0, {
      timeout: 15000,
    });

    await expect
      .poll(async () => {
        const messages = await getAllMessages(agentId);
        const userTurn = [...messages].reverse().find((entry) => {
          const payload = entry.payload as { data?: { text?: string } };
          return entry.kind === 'user' && payload?.data?.text === promptText;
        }) as { id?: number } | undefined;
        const userTurnId = userTurn?.id;
        if (typeof userTurnId !== 'number') {
          return -1;
        }
        return messages.filter(
          (entry) => entry.kind === 'error' && entry.replyToMessageId === userTurnId
        ).length;
      })
      .toBe(0);

    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits code_exec calls that invoke main-pipeline-only and non-allowlisted sandbox tools
     Action: user sends a message
     Assertions: both calls end with policy_denied and specific policy messages
     Requirements: code_exec.2.7, code_exec.2.8, code_exec.2.8.1 */
  test('should deny main-pipeline-only and non-allowlisted sandbox tools', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'tool-deny-main',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Try forbidden main-only tool',
              code: "window.tools.final_answer({ summary_points: ['x'] })",
              timeout_ms: 10000,
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            callId: 'tool-deny-allowlist',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Try non-allowlisted tool',
              code: "window.tools.search_docs({ query: 'x' })",
              timeout_ms: 10000,
            },
          },
        ],
      },
      {
        content: '{"action":{"type":"text","content":"policy handled"}}',
      },
    ]);

    await launchWithMockLLM();
    await sendUserMessage('Run forbidden sandbox tools');
    await expect(window.locator('.message-llm-action-response').last()).toContainText(
      'policy handled',
      {
        timeout: 15000,
      }
    );

    const agentId = (await getAgentIdsFromApi(window))[0];
    const mainDenied = await findCodeExecCallByCallId(agentId, 'tool-deny-main');
    const allowlistDenied = await findCodeExecCallByCallId(agentId, 'tool-deny-allowlist');
    expect(mainDenied?.payload?.data?.output?.error?.code).toBe('policy_denied');
    expect(mainDenied?.payload?.data?.output?.error?.message ?? '').toContain(
      'Main-pipeline-only tool is denied in sandbox runtime.'
    );
    expect(allowlistDenied?.payload?.data?.output?.error?.code).toBe('policy_denied');
    expect(allowlistDenied?.payload?.data?.output?.error?.message ?? '').toContain(
      'Tool is not allowed in sandbox allowlist.'
    );
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits code_exec call that uses Worker API
     Action: user sends a message
     Assertions: terminal policy_denied is returned with multithreading denial reason
     Requirements: code_exec.2.9, code_exec.2.9.1 */
  test('should deny multithreading APIs in sandbox runtime', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'deny-worker',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Try Worker API',
              code: "new Worker('data:text/javascript,postMessage(1)')",
              timeout_ms: 10000,
            },
          },
        ],
      },
      {
        content: '{"action":{"type":"text","content":"worker denied"}}',
      },
    ]);

    await launchWithMockLLM();
    await sendUserMessage('Try multithreading API');
    await expect(window.locator('.message-llm-action-response').last()).toContainText(
      'worker denied',
      {
        timeout: 15000,
      }
    );

    const agentId = (await getAgentIdsFromApi(window))[0];
    const denied = await findCodeExecCallByCallId(agentId, 'deny-worker');
    expect(denied?.payload?.data?.output?.error?.code).toBe('policy_denied');
    expect(denied?.payload?.data?.output?.error?.message ?? '').toContain(
      'Multithreading APIs are not allowed in sandbox runtime.'
    );
    await expectNoToastError(window);
  });

  /* Preconditions: runtime event subscription is active and mock model emits one code_exec success call
   Action: user sends a message and waits for completion
   Assertions: both message.created and message.updated are emitted for code_exec lifecycle in same callId
   Requirements: code_exec.4.2, code_exec.4.3 */
  test('should publish message.created and message.updated for code_exec lifecycle', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'evt-1',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Emit lifecycle events with delayed completion',
              code: "await new Promise((resolve) => setTimeout(resolve, 1200)); console.log('evt')",
              timeout_ms: 10000,
            },
          },
        ],
      },
      {
        content: '{"action":{"type":"text","content":"evt done"}}',
      },
    ]);

    await launchWithMockLLM();
    await window.evaluate(() => {
      const globalWindow = window as unknown as {
        api: any;
        __codeExecLifecycleEvents?: Array<{ type: string; payload: any }>;
        __unsubscribeCodeExecEvents?: () => void;
      };
      globalWindow.__codeExecLifecycleEvents = [];
      globalWindow.__unsubscribeCodeExecEvents = globalWindow.api.events?.onEvent(
        (type: string, payload: unknown) => {
          globalWindow.__codeExecLifecycleEvents?.push({ type, payload });
        }
      );
    });

    try {
      await sendUserMessage('Emit lifecycle events');
      await expect(window.locator('.message-llm-action-response').last()).toContainText(
        'evt done',
        {
          timeout: 15000,
        }
      );
      await expect(
        window.locator('[data-testid="message-code-exec-status-icon"][data-status="running"]')
      ).toHaveCount(0, { timeout: 8000 });

      await expect
        .poll(async () => {
          return await window.evaluate(() => {
            const globalWindow = window as unknown as {
              __codeExecLifecycleEvents?: Array<{ type: string; payload: any }>;
            };
            const events = globalWindow.__codeExecLifecycleEvents ?? [];
            const codeExecEvents = events.filter((entry) => {
              const message = entry.payload?.message;
              return (
                (entry.type === 'message.created' || entry.type === 'message.updated') &&
                message?.kind === 'tool_call' &&
                message?.payload?.data?.toolName === 'code_exec' &&
                message?.payload?.data?.callId === 'evt-1'
              );
            });
            const created = codeExecEvents.filter((entry) => entry.type === 'message.created');
            const updated = codeExecEvents.filter((entry) => entry.type === 'message.updated');
            return {
              createdCount: created.length,
              updatedCount: updated.length,
              hasRunningCreated: created.some(
                (entry) => entry.payload?.message?.payload?.data?.output?.status === 'running'
              ),
              hasTerminalUpdated: updated.some((entry) => {
                const status = entry.payload?.message?.payload?.data?.output?.status;
                const done = entry.payload?.message?.done;
                return status === 'success' && done === true;
              }),
              runningCreatedIndex: codeExecEvents.findIndex(
                (entry) =>
                  entry.type === 'message.created' &&
                  entry.payload?.message?.payload?.data?.output?.status === 'running'
              ),
              terminalUpdatedIndex: codeExecEvents.findIndex((entry) => {
                const status = entry.payload?.message?.payload?.data?.output?.status;
                const done = entry.payload?.message?.done;
                return entry.type === 'message.updated' && status === 'success' && done === true;
              }),
            };
          });
        })
        .toEqual(
          expect.objectContaining({
            createdCount: expect.any(Number),
            updatedCount: expect.any(Number),
            hasRunningCreated: true,
            hasTerminalUpdated: true,
            runningCreatedIndex: expect.any(Number),
            terminalUpdatedIndex: expect.any(Number),
          })
        );
      const eventOrder = await window.evaluate(() => {
        const globalWindow = window as unknown as {
          __codeExecLifecycleEvents?: Array<{ type: string; payload: any }>;
        };
        const events = globalWindow.__codeExecLifecycleEvents ?? [];
        const codeExecEvents = events.filter((entry) => {
          const message = entry.payload?.message;
          return (
            (entry.type === 'message.created' || entry.type === 'message.updated') &&
            message?.kind === 'tool_call' &&
            message?.payload?.data?.toolName === 'code_exec' &&
            message?.payload?.data?.callId === 'evt-1'
          );
        });
        const runningCreatedIndex = codeExecEvents.findIndex(
          (entry) =>
            entry.type === 'message.created' &&
            entry.payload?.message?.payload?.data?.output?.status === 'running'
        );
        const terminalUpdatedIndex = codeExecEvents.findIndex((entry) => {
          const status = entry.payload?.message?.payload?.data?.output?.status;
          const done = entry.payload?.message?.done;
          return entry.type === 'message.updated' && status === 'success' && done === true;
        });
        return { runningCreatedIndex, terminalUpdatedIndex };
      });
      expect(eventOrder.runningCreatedIndex).toBeGreaterThanOrEqual(0);
      expect(eventOrder.terminalUpdatedIndex).toBeGreaterThanOrEqual(0);
      expect(eventOrder.runningCreatedIndex).toBeLessThan(eventOrder.terminalUpdatedIndex);
      const lifecycleCounters = await window.evaluate(() => {
        const globalWindow = window as unknown as {
          __codeExecLifecycleEvents?: Array<{ type: string; payload: any }>;
        };
        const events = globalWindow.__codeExecLifecycleEvents ?? [];
        const codeExecEvents = events.filter((entry) => {
          const message = entry.payload?.message;
          return (
            (entry.type === 'message.created' || entry.type === 'message.updated') &&
            message?.kind === 'tool_call' &&
            message?.payload?.data?.toolName === 'code_exec' &&
            message?.payload?.data?.callId === 'evt-1'
          );
        });
        return {
          createdCount: codeExecEvents.filter((entry) => entry.type === 'message.created').length,
          updatedCount: codeExecEvents.filter((entry) => entry.type === 'message.updated').length,
        };
      });
      expect(lifecycleCounters.createdCount).toBeGreaterThanOrEqual(1);
      expect(lifecycleCounters.updatedCount).toBeGreaterThanOrEqual(1);
      await expectNoToastError(window);
    } finally {
      await window.evaluate(() => {
        const globalWindow = window as unknown as { __unsubscribeCodeExecEvents?: () => void };
        globalWindow.__unsubscribeCodeExecEvents?.();
      });
    }
  });

  /* Preconditions: active long-running code_exec execution is in-flight
     Action: app receives cancel request and then close request
     Assertions: shutdown completes within bounded time (no hanging close)
     Requirements: code_exec.2.10, code_exec.2.10.1 */
  test('should shutdown without hanging when code_exec is active', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'shutdown-1',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Start run and close app while active',
              code: 'await new Promise(() => {});',
              timeout_ms: 60000,
            },
          },
        ],
      },
    ]);

    await launchWithMockLLM();
    await sendUserMessage('Start run and close app');

    await expect(window.locator('[data-testid="prompt-input-stop"]')).toBeVisible({
      timeout: 15000,
    });
    const cancelResult = await window.evaluate(
      async (id) => {
        const api = (window as unknown as { api: any }).api;
        return await api.messages.cancel(id);
      },
      (await getAgentIdsFromApi(window))[0] as string
    );
    expect(cancelResult?.success).toBe(true);

    const closedWithinBound = await Promise.race([
      electronApp.close().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 25000)),
    ]);
    expect(closedWithinBound).toBe(true);
    appClosedInTest = true;
  });
});
