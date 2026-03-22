/* Preconditions: Electron app is launched with real provider API keys and authenticated via mock OAuth
   Action: LLM triggers code_exec that calls tools.web_search and prints helper output
   Assertions: code_exec stdout contains real provider-backed payload and not stubbed placeholder data
   Requirements: sandbox-web-search.1.1, sandbox-web-search.2.3, sandbox-web-search.2.4, sandbox-web-search.2.5, sandbox-web-search.3.1, sandbox-web-search.6.2, testing.12.1 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  completeOAuthFlow,
  createMockOAuthServer,
  expectAgentsVisible,
  expectNoToastError,
  getAgentIdsFromApi,
  launchElectronWithMockOAuth,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

const OPENAI_REAL_API_KEY = process.env.CLERKLY_OPENAI_API_KEY;
const ANTHROPIC_REAL_API_KEY = process.env.CLERKLY_ANTHROPIC_API_KEY;
const GOOGLE_REAL_API_KEY = process.env.CLERKLY_GOOGLE_API_KEY;

type LLMProvider = 'openai' | 'anthropic' | 'google';

let electronApp: ElectronApplication;
let window: Page;
let mockOAuthServer: MockOAuthServer;

async function sendUserMessage(text: string) {
  const input = window.locator(
    '[data-testid="agent-chat-root"][data-active="true"] [data-testid="auto-expanding-textarea"]'
  );
  await expect(input).toHaveCount(1, { timeout: 5000 });
  await input.click();
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
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

// Requirements: sandbox-web-search.1.5, sandbox-web-search.6.2
async function setLLMProvider(provider: LLMProvider): Promise<void> {
  const saveResult = await window.evaluate(async (targetProvider) => {
    const api = (window as unknown as { api: any }).api;
    const save = await api.settings.saveLLMProvider(targetProvider);
    if (!save?.success) {
      return { ok: false, error: save?.error ?? 'Failed to save provider' };
    }

    const load = await api.settings.loadLLMProvider();
    if (!load?.success) {
      return { ok: false, error: load?.error ?? 'Failed to load provider' };
    }

    return {
      ok: load?.data?.provider === targetProvider,
      provider: load?.data?.provider,
      error: load?.data?.provider === targetProvider ? undefined : 'Provider mismatch',
    };
  }, provider);

  expect(saveResult.ok).toBe(true);
}

// Requirements: sandbox-web-search.5.2, sandbox-web-search.6.2
async function getLastSuccessfulCodeExecStdout(): Promise<string> {
  const agentId = (await getAgentIdsFromApi(window))[0];
  expect(agentId).toBeTruthy();

  const allMessages = await getAllMessages(agentId as string);
  const toolCalls = allMessages.filter((entry) => entry.kind === 'tool_call');
  const codeExecCalls = toolCalls.filter((entry) => {
    const payload = entry.payload as { data?: { toolName?: string; output?: { status?: string } } };
    return payload?.data?.toolName === 'code_exec' && payload?.data?.output?.status === 'success';
  });

  expect(codeExecCalls.length).toBeGreaterThan(0);
  const lastCodeExec = codeExecCalls[codeExecCalls.length - 1];
  const stdout = String(
    (
      lastCodeExec.payload as {
        data?: { output?: { stdout?: unknown } };
      }
    )?.data?.output?.stdout ?? ''
  ).trim();

  expect(stdout.length).toBeGreaterThan(0);
  return stdout;
}

test.beforeAll(async () => {
  mockOAuthServer = await createMockOAuthServer();
  mockOAuthServer.setUserProfile({
    id: 'test-code-exec-real-user',
    email: 'code.exec.real@example.com',
    name: 'Code Exec Real User',
    given_name: 'Code',
    family_name: 'Exec Real User',
  });
});

test.afterAll(async () => {
  if (mockOAuthServer) {
    await mockOAuthServer.stop();
  }
});

test.afterEach(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

test.describe('code_exec web_search (real OpenAI)', () => {
  test.beforeAll(() => {
    test.skip(!OPENAI_REAL_API_KEY, 'CLERKLY_OPENAI_API_KEY is required for real web_search test');
  });

  /* Preconditions: authenticated app with real OpenAI key in runtime env
     Action: user asks model to run code_exec with tools.web_search and print JSON result
     Assertions: persisted code_exec output includes OpenAI provider-native payload and excludes stub values
     Requirements: sandbox-web-search.1.1, sandbox-web-search.2.3, sandbox-web-search.3.1, sandbox-web-search.6.2, testing.12.1 */
  test('should execute tools.web_search against real OpenAI and return non-stub payload', async () => {
    const context = await launchElectronWithMockOAuth(mockOAuthServer, {
      CLERKLY_OPENAI_API_URL: 'https://api.openai.com/v1/responses',
      CLERKLY_OPENAI_API_KEY: OPENAI_REAL_API_KEY ?? '',
      CLERKLY_ANTHROPIC_API_KEY: '',
      CLERKLY_GOOGLE_API_KEY: '',
    });
    electronApp = context.app;
    window = context.window;

    await completeOAuthFlow(electronApp, window);
    await expectAgentsVisible(window, 10000);
    await setLLMProvider('openai');

    await sendUserMessage(
      [
        'Use the code_exec tool exactly once.',
        'Inside code_exec execute exactly this JavaScript:',
        'const result = await tools.web_search({ queries: ["latest Iran news"] });',
        'console.log(JSON.stringify(result));',
        'Then provide final_answer with one short summary point.',
      ].join('\n')
    );

    await expect(window.locator('.message-llm-action-response').last()).toBeVisible({
      timeout: 120000,
    });

    const stdout = await getLastSuccessfulCodeExecStdout();
    const payload = JSON.parse(stdout) as {
      provider?: unknown;
      output?: Array<{ query?: unknown; response?: unknown }>;
    };

    expect(payload.provider).toBe('openai');
    expect(Array.isArray(payload.output)).toBe(true);
    expect((payload.output ?? []).length).toBeGreaterThan(0);
    expect(payload.output?.[0]?.response).toBeTruthy();

    expect(stdout).not.toContain('https://example.com/1');
    expect(stdout).not.toContain('Search Result 1');

    await expectNoToastError(window);
  });
});

test.describe('code_exec web_search (real Anthropic)', () => {
  test.beforeAll(() => {
    test.skip(
      !ANTHROPIC_REAL_API_KEY,
      'CLERKLY_ANTHROPIC_API_KEY is required for real web_search test'
    );
  });

  /* Preconditions: authenticated app with real Anthropic key in runtime env
     Action: user asks model to run code_exec with Anthropic-native web_search input and print JSON result
     Assertions: persisted code_exec output includes Anthropic provider-native payload and excludes stub values
     Requirements: sandbox-web-search.1.1, sandbox-web-search.2.4, sandbox-web-search.3.1, sandbox-web-search.6.2, testing.12.1 */
  test('should execute tools.web_search against real Anthropic and return non-stub payload', async () => {
    const context = await launchElectronWithMockOAuth(mockOAuthServer, {
      CLERKLY_OPENAI_API_KEY: '',
      CLERKLY_ANTHROPIC_API_KEY: ANTHROPIC_REAL_API_KEY ?? '',
      CLERKLY_GOOGLE_API_KEY: '',
    });
    electronApp = context.app;
    window = context.window;

    await completeOAuthFlow(electronApp, window);
    await expectAgentsVisible(window, 10000);
    await setLLMProvider('anthropic');

    await sendUserMessage(
      [
        'Use the code_exec tool exactly once.',
        'Inside code_exec execute exactly this JavaScript:',
        'const result = await tools.web_search({ query: "latest Iran news" });',
        'console.log(JSON.stringify(result));',
        'Then provide final_answer with one short summary point.',
      ].join('\n')
    );

    await expect(window.locator('.message-llm-action-response').last()).toBeVisible({
      timeout: 120000,
    });

    const stdout = await getLastSuccessfulCodeExecStdout();
    const payload = JSON.parse(stdout) as {
      provider?: unknown;
      output?: { id?: unknown; content?: unknown };
    };

    expect(payload.provider).toBe('anthropic');
    expect(payload.output).toBeTruthy();
    expect(payload.output?.id).toBeTruthy();

    expect(stdout).not.toContain('Anthropic Result');
    expect(stdout).not.toContain('Search Result 1');

    await expectNoToastError(window);
  });
});

test.describe('code_exec web_search (real Google)', () => {
  test.beforeAll(() => {
    test.skip(!GOOGLE_REAL_API_KEY, 'CLERKLY_GOOGLE_API_KEY is required for real web_search test');
  });

  /* Preconditions: authenticated app with real Google key in runtime env
     Action: user asks model to run code_exec with Gemini-native web_search input and print JSON result
     Assertions: persisted code_exec output includes Google provider-native payload and excludes stub values
     Requirements: sandbox-web-search.1.1, sandbox-web-search.2.5, sandbox-web-search.3.1, sandbox-web-search.6.2, testing.12.1 */
  test('should execute tools.web_search against real Google and return non-stub payload', async () => {
    const context = await launchElectronWithMockOAuth(mockOAuthServer, {
      CLERKLY_OPENAI_API_KEY: '',
      CLERKLY_ANTHROPIC_API_KEY: '',
      CLERKLY_GOOGLE_API_KEY: GOOGLE_REAL_API_KEY ?? '',
    });
    electronApp = context.app;
    window = context.window;

    await completeOAuthFlow(electronApp, window);
    await expectAgentsVisible(window, 10000);
    await setLLMProvider('google');

    await sendUserMessage(
      [
        'Use the code_exec tool exactly once.',
        'Inside code_exec execute exactly this JavaScript:',
        'const result = await tools.web_search({ queries: ["latest Iran news"] });',
        'console.log(JSON.stringify(result));',
        'Then provide final_answer with one short summary point.',
      ].join('\n')
    );

    await expect(window.locator('.message-llm-action-response').last()).toBeVisible({
      timeout: 120000,
    });

    const stdout = await getLastSuccessfulCodeExecStdout();
    const payload = JSON.parse(stdout) as {
      provider?: unknown;
      output?: Array<{ query?: unknown; response?: unknown }>;
    };

    expect(payload.provider).toBe('google');
    expect(Array.isArray(payload.output)).toBe(true);
    expect((payload.output ?? []).length).toBeGreaterThan(0);
    expect(payload.output?.[0]?.response).toBeTruthy();

    expect(stdout).not.toContain('https://google.com/1');
    expect(stdout).not.toContain('Search Result 1');

    await expectNoToastError(window);
  });
});
