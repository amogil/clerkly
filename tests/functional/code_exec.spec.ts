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
  const input = window.locator('textarea[placeholder*="Ask"]');
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
  const toolCalls = await getToolCallMessages(agentId);
  return toolCalls.find((entry) => {
    const payload = entry.payload as { data?: { callId?: string; toolName?: string } };
    return payload?.data?.toolName === 'code_exec' && payload?.data?.callId === callId;
  }) as
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
    | undefined;
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
     Action: create persisted kind:tool_call with toolName=code_exec and terminal output
     Assertions: dedicated code_exec block renders status/stdout/stderr testids
     Requirements: agents.7.4.5, agents.7.4.6, agents.7.4.7 */
  test('should render tool_call(code_exec) message block in chat', async () => {
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
    await expect(window.locator('[data-testid="message-code-exec-status"]').last()).toHaveText(
      'success'
    );
    await expect(window.locator('[data-testid="message-code-exec-stdout"]').last()).toContainText(
      'ok'
    );
    await expect(window.locator('[data-testid="message-code-exec-stderr"]').last()).toContainText(
      'warn'
    );

    await expectNoToastError(window);
  });

  /* Preconditions: authenticated app
     Action: create done code_exec tool_call as last message
     Assertions: agent status remains in-progress (not completed/error)
     Requirements: agents.9.2, agents.9.2.1 */
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
          arguments: { code: '1+1' },
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
  /* Preconditions: mock model repeatedly emits invalid code_exec args
     Action: user sends a message that triggers code_exec calls
     Assertions: invalid call is not persisted as terminal code_exec result; turn ends with persisted kind:error for the same turn
     Requirements: code_exec.5.1.4, code_exec.5.1.5, code_exec.6.3 */
  test('should not persist successful terminal code_exec for invalid arguments', async () => {
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
    const hasTerminalCodeExec = toolCalls.some((entry) => {
      const payload = entry.payload as {
        data?: { toolName?: string; output?: { status?: string } };
      };
      const status = payload?.data?.output?.status;
      return payload?.data?.toolName === 'code_exec' && status !== 'running';
    });
    expect(hasTerminalCodeExec).toBe(false);

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
        toolCalls: [{ callId: 'big-1', toolName: 'code_exec', arguments: { code: oversizedCode } }],
      },
      {
        toolCalls: [{ callId: 'big-2', toolName: 'code_exec', arguments: { code: oversizedCode } }],
      },
      {
        toolCalls: [{ callId: 'big-3', toolName: 'code_exec', arguments: { code: oversizedCode } }],
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
    const toolCalls = await getToolCallMessages(agentId);
    const codeExec = toolCalls.find((entry) => {
      const payload = entry.payload as { data?: { toolName?: string } };
      return payload?.data?.toolName === 'code_exec';
    }) as { payload?: { data?: { output?: Record<string, unknown> } } } | undefined;
    expect(codeExec).toBeDefined();

    const output = codeExec?.payload?.data?.output;
    expect(output?.stdout_truncated).toBe(true);
    expect(output?.stderr_truncated).toBe(true);
    expect(typeof output?.stdout).toBe('string');
    expect(typeof output?.stderr).toBe('string');
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits two code_exec calls in one turn and then final text
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
            arguments: { code: "console.log('A')", timeout_ms: 10000 },
          },
          {
            callId: 'parallel-b',
            toolName: 'code_exec',
            arguments: { code: "console.log('B')", timeout_ms: 10000 },
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
            arguments: { code: "console.log('audit')", timeout_ms: 10000 },
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
      const toolCalls = await getToolCallMessages(agentId);
      const codeExec = toolCalls.find((entry) => {
        const payload = entry.payload as { data?: { toolName?: string } };
        return payload?.data?.toolName === 'code_exec';
      }) as { payload?: { data?: { output?: { error?: { code?: string } } } } } | undefined;

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
      const toolCalls = await getToolCallMessages(agentId);
      const codeExecCalls = toolCalls.filter((entry) => {
        const payload = entry.payload as { data?: { toolName?: string } };
        return payload?.data?.toolName === 'code_exec';
      }) as Array<{ payload?: { data?: { output?: { error?: { code?: string } } } } }>;
      expect(codeExecCalls.length).toBeGreaterThanOrEqual(2);
      for (const call of codeExecCalls) {
        expect(call.payload?.data?.output?.error?.code).toBe('policy_denied');
      }
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
            arguments: { code: "console.log('history')", timeout_ms: 10000 },
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
      {
        content: '{"action":{"type":"text","content":"second done"}}',
      },
    ]);

    await launchWithMockLLM();
    await sendUserMessage('First run with code tool');
    await expect(window.locator('[data-testid="message-final-answer-block"]').last()).toBeVisible({
      timeout: 15000,
    });
    await sendUserMessage('Second turn after code_exec');
    await expect
      .poll(async () => {
        const agentId = (await getAgentIdsFromApi(window))[0];
        const messages = await getAllMessages(agentId);
        return messages.some((entry) => {
          const payload = entry.payload as { data?: { text?: string } };
          return entry.kind === 'user' && payload?.data?.text === 'Second turn after code_exec';
        });
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
            arguments: { code: 'while (true) {}', timeout_ms: 10000 },
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
            arguments: { code: "const huge = 'x'.repeat(2 ** 31); console.log(huge.length);" },
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

  /* Preconditions: mock model emits CPU-intensive code_exec that can finish under timeout
     Action: user sends a message
     Assertions: resource monitor surfaces either degraded-mode diagnostic in stderr or controlled limit_exceeded
     Requirements: code_exec.2.11.2, code_exec.2.11.4 */
  test('should surface resource-monitor diagnostics or limit_exceeded under CPU pressure', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        toolCalls: [
          {
            callId: 'degraded-1',
            toolName: 'code_exec',
            arguments: {
              code: "const start = Date.now(); while (Date.now() - start < 500) {} console.log('degraded done');",
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
    await expect(window.locator('.message-llm-action-response').last()).toContainText(
      'degraded handled',
      { timeout: 20000 }
    );

    const agentId = (await getAgentIdsFromApi(window))[0];
    const degradedCall = await findCodeExecCallByCallId(agentId, 'degraded-1');
    const output = degradedCall?.payload?.data?.output;
    expect(output).toBeDefined();
    if (output?.status === 'success') {
      expect(output?.stderr ?? '').toContain('Execution continued in degraded mode');
    } else {
      expect(output?.status).toBe('error');
      expect(['limit_exceeded', 'sandbox_runtime_error']).toContain(output?.error?.code ?? '');
      expect(output?.error?.message ?? '').not.toBe('');
    }
    await expectNoToastError(window);
  });

  /* Preconditions: mock model emits non-terminating code_exec call
     Action: user sends a message and cancels active run
     Assertions: cancel request succeeds and no kind:error is persisted for this turn
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
      timeout: 5000,
    });

    const cancelResult = await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      return await api.messages.cancel(id);
    }, agentId as string);
    expect(cancelResult?.success).toBe(true);

    await expect(window.locator('[data-testid="prompt-input-send"]')).toBeVisible({
      timeout: 5000,
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
            };
          });
        })
        .toEqual(
          expect.objectContaining({
            createdCount: expect.any(Number),
            updatedCount: expect.any(Number),
            hasRunningCreated: true,
            hasTerminalUpdated: true,
          })
        );
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
     Action: app receives close request
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
      timeout: 5000,
    });

    const closedWithinBound = await Promise.race([
      electronApp.close().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
    ]);
    expect(closedWithinBound).toBe(true);
    appClosedInTest = true;
  });
});
