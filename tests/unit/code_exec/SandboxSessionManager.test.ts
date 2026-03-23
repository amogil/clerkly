// Requirements: code_exec.1.5, code_exec.2, code_exec.3.7

const mockAppPath = '/mock/clerkly';
const mockPreloadPath = `${mockAppPath}/dist/preload/preload/codeExecSandbox.js`;

jest.mock('node:fs', () => ({
  __esModule: true,
  default: {
    existsSync: jest.fn((targetPath: string) => targetPath === mockPreloadPath),
  },
  existsSync: jest.fn((targetPath: string) => targetPath === mockPreloadPath),
}));

jest.mock('electron', () => {
  const getAppMetrics = jest.fn(() => []);
  const getAppPath = jest.fn(() => mockAppPath);
  const sandboxBridgeInvokeTool = jest.fn(async (toolName: string, input: unknown) => {
    if (toolName !== 'http_request') {
      return {
        error: {
          code: 'internal_error',
          message: `Unexpected tool: ${toolName}`,
        },
      };
    }

    return {
      status: 200,
      final_url: (input as { url?: string }).url ?? 'https://example.com',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
      content_type: 'text/plain; charset=utf-8',
      body_encoding: 'text',
      body: 'ok',
      truncated: false,
      applied_limit_bytes: 262144,
    };
  });
  const browserWindowInstances: unknown[] = [];

  class MockBrowserWindow {
    private destroyed = false;
    public options: { webPreferences?: { preload?: string; additionalArguments?: string[] } };

    constructor(options: {
      webPreferences?: { preload?: string; additionalArguments?: string[] };
    }) {
      this.options = options;
      browserWindowInstances.push(this);
    }

    public webContents = {
      executeJavaScript: jest.fn(async (script: string) => {
        if (script.includes('while (true) {}')) {
          return await new Promise(() => undefined);
        }
        const nodeVm = require('node:vm') as typeof import('node:vm');
        const hasSandboxBridge =
          this.options.webPreferences?.preload === mockPreloadPath &&
          this.options.webPreferences?.additionalArguments?.some((arg) =>
            arg.startsWith('--code-exec-session-id=')
          );
        return await nodeVm.runInNewContext(script, {
          setTimeout,
          clearTimeout,
          Promise,
          ...(hasSandboxBridge
            ? {
                __sandboxBridge: {
                  invokeTool: sandboxBridgeInvokeTool,
                },
              }
            : {}),
        });
      }),
      isDestroyed: jest.fn(() => this.destroyed),
      forcefullyCrashRenderer: jest.fn(),
      setWindowOpenHandler: jest.fn(),
      setBackgroundThrottling: jest.fn(),
      on: jest.fn(),
      getOSProcessId: jest.fn(() => 4242),
    };

    async loadURL(): Promise<void> {
      return;
    }

    isDestroyed(): boolean {
      return this.destroyed;
    }

    destroy(): void {
      this.destroyed = true;
    }
  }

  return {
    app: {
      getAppMetrics,
      getAppPath,
    },
    BrowserWindow: MockBrowserWindow,
    session: {
      fromPartition: jest.fn(() => ({
        webRequest: {
          onBeforeRequest: jest.fn(),
        },
        setPermissionRequestHandler: jest.fn(),
        setPermissionCheckHandler: jest.fn(),
        clearStorageData: jest.fn(async () => undefined),
      })),
    },
    __mocks: {
      sandboxBridgeInvokeTool,
      browserWindowInstances,
    },
  };
});

import { app } from 'electron';
import fs from 'node:fs';
import { SandboxSessionManager } from '../../../src/main/code_exec/SandboxSessionManager';
import {
  normalizeCodeExecOutput,
  resolveCodeExecSandboxPreloadPath,
  toCodeExecInput,
} from '../../../src/main/code_exec/SandboxSessionManager';

const electronMocks = jest.requireMock('electron').__mocks as {
  sandboxBridgeInvokeTool: jest.Mock;
  browserWindowInstances: Array<{
    options: { webPreferences?: { preload?: string; additionalArguments?: string[] } };
  }>;
};
const fsExistsSyncMock = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

describe('SandboxSessionManager.execute', () => {
  afterEach(() => {
    jest.clearAllMocks();
    electronMocks.browserWindowInstances.length = 0;
    fsExistsSyncMock.mockImplementation(
      (targetPath: fs.PathLike) => String(targetPath) === mockPreloadPath
    );
  });

  /* Preconditions: Sandbox session manager uses Electron app path to configure preload and runtime exposes sandbox bridge when preload/session args are correct
     Action: Execute sandbox code that calls await window.tools.http_request(...)
     Assertions: http_request succeeds through the sandbox bridge and BrowserWindow preload points to dist/preload/preload/codeExecSandbox.js
     Requirements: code_exec.1.5, code_exec.2.2, sandbox-http-request.1.1, sandbox-http-request.1.2, sandbox-http-request.1.3 */
  it('uses preload bridge so sandbox code can call http_request', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-bridge',
      {
        task_summary: 'Fetch URL through bridge',
        code: 'const response = await window.tools.http_request({ url: "https://example.com" }); console.log(response.status);',
      },
      'openai',
      ''
    );

    const lastInstance = electronMocks.browserWindowInstances.at(-1);
    expect(lastInstance?.options.webPreferences?.preload).toBe(mockPreloadPath);
    expect(lastInstance?.options.webPreferences?.additionalArguments).toContainEqual(
      expect.stringMatching(/^--code-exec-session-id=/)
    );
    expect(electronMocks.sandboxBridgeInvokeTool).toHaveBeenCalledWith('http_request', {
      url: 'https://example.com',
    });
    expect(result.status).toBe('success');
    expect(result.stdout).toContain('200');
  });

  /* Preconditions: Sandbox session manager exposes http_request bridge during one sandbox execution
     Action: Execute sandbox code that performs multiple helper calls, including independent concurrent calls via Promise.all
     Assertions: All helper calls succeed and the bridge is invoked once per request within the same execution
     Requirements: sandbox-http-request.1.3, sandbox-http-request.1.3.1, sandbox-http-request.1.3.2 */
  it('supports multiple http_request calls within one sandbox execution', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-multi',
      {
        task_summary: 'Fetch multiple URLs through bridge',
        code: `const [first, second] = await Promise.all([
  window.tools.http_request({ url: "https://example.com/one" }),
  window.tools.http_request({ url: "https://example.com/two" })
]);
console.log(first.status, second.status);`,
      },
      'openai',
      ''
    );

    expect(electronMocks.sandboxBridgeInvokeTool).toHaveBeenCalledTimes(2);
    expect(electronMocks.sandboxBridgeInvokeTool).toHaveBeenNthCalledWith(1, 'http_request', {
      url: 'https://example.com/one',
    });
    expect(electronMocks.sandboxBridgeInvokeTool).toHaveBeenNthCalledWith(2, 'http_request', {
      url: 'https://example.com/two',
    });
    expect(result.status).toBe('success');
    expect(result.stdout).toContain('200 200');
  });

  /* Preconditions: Sandbox session manager receives valid code that writes to stdout
     Action: Execute code that logs a line
     Assertions: Execution succeeds, stdout contains the message, and stderr stays empty
     Requirements: code_exec.3.7 */
  it('executes code and captures stdout', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Print hello',
        code: "console.log('hello')",
      },
      'openai',
      ''
    );

    expect(result.status).toBe('success');
    expect(result.stdout).toContain('hello');
    expect(result.stderr).toBe('');
  });

  /* Preconditions: Sandbox session manager receives sandbox code that tries to use forbidden browser networking API
     Action: Execute code that calls fetch directly
     Assertions: Execution fails with policy_denied
     Requirements: code_exec.2.2 */
  it('returns policy_denied for forbidden browser network API', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Try fetch',
        code: 'fetch("https://example.com")',
      },
      'openai',
      ''
    );

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('policy_denied');
  });

  /* Preconditions: Sandbox session manager receives sandbox code that accesses browser networking API through globalThis
     Action: Execute code that calls globalThis.fetch
     Assertions: Execution fails with policy_denied
     Requirements: code_exec.2.2 */
  it('returns policy_denied for globalThis browser network API access', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Try global fetch',
        code: 'globalThis.fetch("https://example.com")',
      },
      'openai',
      ''
    );

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('policy_denied');
  });

  /* Preconditions: Sandbox session manager receives sandbox code that tries to create a worker
     Action: Execute code that constructs Worker
     Assertions: Execution fails with policy_denied
     Requirements: code_exec.2.2 */
  it('returns policy_denied for multithreading API', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Create worker',
        code: 'new Worker("a.js")',
      },
      'openai',
      ''
    );

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('policy_denied');
  });

  /* Preconditions: Sandbox code attempts to use Node.js global that is unavailable in runtime
     Action: Execute code that calls process.exit(0)
     Assertions: Execution fails with policy_denied and normalized Node.js globals message
     Requirements: code_exec.2.1, code_exec.2.4, code_exec.3.5 */
  it('returns policy_denied for Node.js globals access in sandbox runtime', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Try process exit',
        code: 'process.exit(0)',
      },
      'openai',
      ''
    );

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('policy_denied');
    expect(result.error?.message).toContain('Node.js globals');
  });

  /* Preconditions: Abort signal is already aborted before execution starts
     Action: Execute sandbox code with the aborted signal
     Assertions: Execution returns cancelled without running user code
     Requirements: code_exec.3.7 */
  it('returns cancelled when aborted', async () => {
    const manager = new SandboxSessionManager();
    const controller = new AbortController();
    controller.abort();

    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Print x',
        code: "console.log('x')",
      },
      'openai',
      '',
      controller.signal
    );

    expect(result.status).toBe('cancelled');
  });

  /* Preconditions: Tool arguments are missing required code_exec fields
     Action: Execute sandbox session with invalid raw args
     Assertions: Execution returns invalid_tool_arguments
     Requirements: code_exec.1.5 */
  it('returns invalid_tool_arguments when args are invalid', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {} as Record<string, unknown>,
      'openai',
      ''
    );

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('invalid_tool_arguments');
  });

  /* Preconditions: Sandbox code writes to console.warn and console.error
     Action: Execute code that emits warning and error lines
     Assertions: Execution succeeds and stderr contains both lines
     Requirements: code_exec.3.7 */
  it('captures stderr from console.warn and console.error', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Write warnings',
        code: "console.warn('w'); console.error('e');",
      },
      'openai',
      ''
    );

    expect(result.status).toBe('success');
    expect(result.stderr).toContain('w');
    expect(result.stderr).toContain('e');
  });

  /* Preconditions: Sandbox code tries to call a helper outside the allowlist
     Action: Execute code that accesses unknown tool on window.tools
     Assertions: Execution fails with policy_denied
     Requirements: code_exec.2.2 */
  it('returns policy_denied for forbidden tools allowlist access', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Call unknown tool',
        code: 'window.tools.someUnknownTool()',
      },
      'openai',
      ''
    );

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('policy_denied');
  });

  /* Preconditions: VM execution path exceeds the configured execution limit
     Action: Invoke executeInOneSandbox with an infinite loop and very low timeout
     Assertions: Internal execution result is timeout with limit_exceeded
     Requirements: code_exec.3.7 */
  it('returns timeout with limit_exceeded when vm timeout error is thrown', async () => {
    const manager = new SandboxSessionManager();
    const result = await (
      manager as unknown as {
        executeInOneSandbox: (
          input: { taskSummary: string; code: string; timeoutMs: number },
          context: {
            sessionId: string;
            provider: 'openai' | 'google' | 'anthropic';
            apiKey: string;
            signal: AbortSignal;
          }
        ) => Promise<{ status: string; error?: { code?: string } }>;
      }
    ).executeInOneSandbox(
      { taskSummary: 'Loop forever', code: 'while (true) {}', timeoutMs: 1 },
      {
        sessionId: 'timeout-test',
        provider: 'openai',
        apiKey: '',
        signal: new AbortController().signal,
      }
    );

    expect(result.status).toBe('timeout');
    expect(result.error?.code).toBe('limit_exceeded');
  });

  /* Preconditions: Sandbox code attempts an allocation that exceeds the runtime safety limit
     Action: Execute code that creates a very large string
     Assertions: Execution fails with limit_exceeded and explanatory message
     Requirements: code_exec.3.7 */
  it('maps memory allocation failures to limit_exceeded', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Allocate large string',
        code: "const huge = 'x'.repeat(2 ** 31)",
      },
      'openai',
      ''
    );

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('limit_exceeded');
    expect(result.error?.message ?? '').toContain('2 GiB');
  });

  /* Preconditions: Sandbox code throws an ordinary runtime exception
     Action: Execute code that throws Error("boom")
     Assertions: Execution fails with sandbox_runtime_error and surfaces the message
     Requirements: code_exec.3.7 */
  it('returns sandbox_runtime_error for generic runtime exceptions', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Throw boom',
        code: 'throw new Error("boom")',
      },
      'openai',
      ''
    );

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('sandbox_runtime_error');
    expect(result.error?.message).toContain('boom');
  });

  /* Preconditions: http_request bridge returns a structured forbidden_destination helper result
     Action: Execute sandbox code that logs the helper result JSON to stdout
     Assertions: Sandbox execution stays successful and preserves the structured helper result in stdout instead of remapping it
     Requirements: sandbox-http-request.4.2.2, code_exec.3.7 */
  it('keeps structured forbidden_destination helper results inside stdout instead of remapping them', async () => {
    electronMocks.sandboxBridgeInvokeTool.mockResolvedValueOnce({
      error: {
        code: 'forbidden_destination',
        message: 'http_request cannot access localhost.',
      },
    });

    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Reject localhost target',
        code: `const result = await tools.http_request({ url: "http://localhost:3000/blocked" });
console.log(JSON.stringify(result));`,
      },
      'openai',
      ''
    );

    expect(result.status).toBe('success');
    expect(result.error).toBeUndefined();
    expect(result.stdout.trim()).toBe(
      JSON.stringify({
        error: {
          code: 'forbidden_destination',
          message: 'http_request cannot access localhost.',
        },
      })
    );
  });

  /* Preconditions: Abort signal is triggered while sandbox code is still running
     Action: Start execution of delayed code and abort shortly after launch
     Assertions: Execution resolves as cancelled
     Requirements: code_exec.3.7 */
  it('returns cancelled when aborted during execution', async () => {
    const manager = new SandboxSessionManager();
    const controller = new AbortController();

    const promise = manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Wait and log done',
        code: 'await new Promise((resolve) => setTimeout(resolve, 30)); console.log("done")',
      },
      'openai',
      '',
      controller.signal
    );

    setTimeout(() => controller.abort(), 5);
    const result = await promise;
    expect(result.status).toBe('cancelled');
  });

  /* Preconditions: Resource monitor reports near-limit state during otherwise successful execution
     Action: Execute delayed code while mocked app metrics exceed near-limit threshold
     Assertions: Execution succeeds and stderr includes degraded mode diagnostic
     Requirements: code_exec.3.7 */
  it('adds degraded-mode diagnostic to stderr when near resource limits', async () => {
    const getAppMetricsMock = app.getAppMetrics as jest.Mock;
    getAppMetricsMock.mockReturnValue([
      {
        pid: 4242,
        cpu: { percentCPUUsage: 95 },
        memory: { workingSetSize: 1024 * 1024 },
      },
    ]);

    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Wait and log ok',
        code: 'await new Promise((resolve) => setTimeout(resolve, 250)); console.log("ok")',
      },
      'openai',
      ''
    );

    expect(result.status).toBe('success');
    expect(result.stderr).toContain('degraded mode');
  });

  /* Preconditions: Resource monitor reports hard CPU limit breach during execution
     Action: Execute delayed code while mocked app metrics exceed hard limit threshold
     Assertions: Execution fails with limit_exceeded and CPU message
     Requirements: code_exec.3.7 */
  it('returns limit_exceeded when hard CPU limit is exceeded', async () => {
    const getAppMetricsMock = app.getAppMetrics as jest.Mock;
    getAppMetricsMock.mockReturnValue([
      {
        pid: 4242,
        cpu: { percentCPUUsage: 140 },
        memory: { workingSetSize: 1024 * 1024 },
      },
    ]);

    const manager = new SandboxSessionManager();
    const result = await manager.execute(
      'agent-1',
      'call-1',
      {
        task_summary: 'Stress CPU briefly',
        code: 'await new Promise((resolve) => setTimeout(resolve, 250)); console.log("ok")',
        timeout_ms: 10000,
      },
      'openai',
      ''
    );

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('limit_exceeded');
    expect(result.error?.message ?? '').toContain('CPU limit exceeded');
  });
});

describe('SandboxSessionManager.shutdown', () => {
  /* Preconditions: No sandbox sessions are active
     Action: Call shutdown on the manager
     Assertions: Shutdown resolves without side effects
     Requirements: code_exec.3.7 */
  it('returns immediately when there are no active sessions', async () => {
    const manager = new SandboxSessionManager();
    await expect(manager.shutdown()).resolves.toBeUndefined();
  });

  /* Preconditions: Active session map contains cancellable entries, including one cancel function that throws
     Action: Call shutdown on the manager
     Assertions: All sessions are cleared and cancel errors are ignored
     Requirements: code_exec.3.7 */
  it('clears active sessions and ignores cancel errors', async () => {
    const manager = new SandboxSessionManager();
    const sessions = (manager as unknown as { activeSessions: Map<string, { cancel: () => void }> })
      .activeSessions;
    sessions.set('ok', { cancel: () => undefined });
    sessions.set('throws', {
      cancel: () => {
        throw new Error('cancel failed');
      },
    });

    await manager.shutdown();
    expect(sessions.size).toBe(0);
  });
});

describe('code_exec helpers', () => {
  /* Preconditions: Electron app path points at repository root
     Action: Resolve the sandbox preload path
     Assertions: Returned path points to dist/preload/preload/codeExecSandbox.js under app.getAppPath()
     Requirements: code_exec.1.5, code_exec.2.2 */
  it('resolves preload path from Electron app path', () => {
    expect(resolveCodeExecSandboxPreloadPath()).toBe(mockPreloadPath);
  });

  /* Preconditions: Bundle layout exposes preload relative to dist/main
     Action: Resolve preload path with a file-relative dist/main current directory
     Assertions: Helper prefers the file-relative preload path
     Requirements: code_exec.1.5, code_exec.2.2 */
  it('prefers file-relative preload path when the current bundle layout provides it', () => {
    fsExistsSyncMock.mockImplementation(
      (targetPath: fs.PathLike) => String(targetPath) === mockPreloadPath
    );

    expect(resolveCodeExecSandboxPreloadPath(`${mockAppPath}/dist/main`)).toBe(mockPreloadPath);
  });

  /* Preconditions: Functional bundle layout exposes preload relative to dist/main/main
     Action: Resolve preload path with a functional-bundle current directory
     Assertions: Helper prefers the functional file-relative preload path
     Requirements: code_exec.1.5, code_exec.2.2 */
  it('prefers file-relative preload path when the functional bundle layout provides it', () => {
    fsExistsSyncMock.mockImplementation(
      (targetPath: fs.PathLike) => String(targetPath) === mockPreloadPath
    );

    expect(resolveCodeExecSandboxPreloadPath(`${mockAppPath}/dist/main/main`)).toBe(
      mockPreloadPath
    );
  });

  /* Preconditions: Raw sandbox output is null
     Action: Normalize the invalid output shape
     Assertions: Result is converted to internal_error
     Requirements: code_exec.3.7 */
  it('normalizes invalid output into internal_error', () => {
    const result = normalizeCodeExecOutput(null);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('internal_error');
  });

  /* Preconditions: Raw sandbox output has an unsupported status value
     Action: Normalize the invalid output shape
     Assertions: Result is converted to internal_error
     Requirements: code_exec.3.7 */
  it('normalizes invalid status into internal_error', () => {
    const result = normalizeCodeExecOutput({ status: 'bad-status' });
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('internal_error');
  });

  /* Preconditions: Raw sandbox output already matches the supported error shape
     Action: Normalize the valid output object
     Assertions: Structured error object and truncation flags are preserved
     Requirements: code_exec.3.7 */
  it('normalizes valid shape and keeps error object', () => {
    const result = normalizeCodeExecOutput({
      status: 'error',
      stdout: 'out',
      stderr: 'err',
      stdout_truncated: 1,
      stderr_truncated: 0,
      error: { code: 'policy_denied', message: 'blocked' },
    });

    expect(result).toEqual({
      status: 'error',
      stdout: 'out',
      stderr: 'err',
      stdout_truncated: true,
      stderr_truncated: false,
      error: { code: 'policy_denied', message: 'blocked' },
    });
  });

  /* Preconditions: Raw tool args are provided both in valid and invalid shapes
     Action: Map the raw values to CodeExecToolInput
     Assertions: Valid values are preserved and invalid values normalize to empty/undefined fields
     Requirements: code_exec.1.5 */
  it('maps raw args to CodeExecToolInput shape', () => {
    expect(toCodeExecInput({ task_summary: 'Print x', code: 'x', timeout_ms: 123 })).toEqual({
      task_summary: 'Print x',
      code: 'x',
      timeout_ms: 123,
    });
    expect(
      toCodeExecInput({
        task_summary: 1,
        code: 1,
        timeout_ms: '1',
      } as unknown as Record<string, unknown>)
    ).toEqual({
      task_summary: '',
      code: '',
      timeout_ms: undefined,
    });
  });
});

describe('SandboxSessionManager private helpers', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    electronMocks.browserWindowInstances.length = 0;
  });

  /* Preconditions: Degraded mode flag is false for an otherwise successful output
     Action: Append degraded diagnostic
     Assertions: Output is returned unchanged
     Requirements: code_exec.3.7 */
  it('returns output unchanged when degraded mode is disabled', () => {
    const manager = new SandboxSessionManager();
    const output = {
      status: 'success' as const,
      stdout: 'ok',
      stderr: '',
      stdout_truncated: false,
      stderr_truncated: false,
    };

    const result = (
      manager as unknown as {
        appendDegradedDiagnostic: (
          out: typeof output,
          degradedModeApplied: boolean
        ) => typeof output;
      }
    ).appendDegradedDiagnostic(output, false);

    expect(result).toEqual(output);
  });

  /* Preconditions: Output already represents a hard limit_exceeded error while degraded mode is true
     Action: Append degraded diagnostic
     Assertions: Existing output is preserved without extra degraded messaging
     Requirements: code_exec.3.7 */
  it('does not append degraded diagnostic for limit_exceeded errors', () => {
    const manager = new SandboxSessionManager();
    const output = {
      status: 'error' as const,
      stdout: '',
      stderr: 'original\n',
      stdout_truncated: false,
      stderr_truncated: false,
      error: {
        code: 'limit_exceeded' as const,
        message: 'limit',
      },
    };

    const result = (
      manager as unknown as {
        appendDegradedDiagnostic: (
          out: typeof output,
          degradedModeApplied: boolean
        ) => typeof output;
      }
    ).appendDegradedDiagnostic(output, true);

    expect(result).toEqual(output);
  });

  /* Preconditions: Resource monitor starts with invalid PID and later gets stopped twice
     Action: Start the resource monitor, advance timers, and stop it twice
     Assertions: Near-limit and hard-limit callbacks are not invoked and repeated stop is safe
     Requirements: code_exec.3.7 */
  it('resource monitor returns early for invalid PID and can be stopped twice safely', () => {
    jest.useFakeTimers();
    const onNearLimit = jest.fn();
    const onHardLimitExceeded = jest.fn();
    const getAppMetricsMock = app.getAppMetrics as jest.Mock;
    getAppMetricsMock.mockReturnValue([
      { pid: 4242, cpu: { percentCPUUsage: 200 }, memory: { workingSetSize: 4 * 1024 * 1024 } },
    ]);

    const manager = new SandboxSessionManager();
    const stop = (
      manager as unknown as {
        startResourceMonitor: (params: {
          sandboxWindow: {
            isDestroyed: () => boolean;
            webContents: {
              isDestroyed: () => boolean;
              getOSProcessId: () => number;
              setBackgroundThrottling: (value: boolean) => void;
            };
          };
          signal: AbortSignal;
          onNearLimit: () => void;
          onHardLimitExceeded: (reason: string) => void;
        }) => () => void;
      }
    ).startResourceMonitor({
      sandboxWindow: {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          getOSProcessId: () => 0,
          setBackgroundThrottling: jest.fn(),
        },
      },
      signal: new AbortController().signal,
      onNearLimit,
      onHardLimitExceeded,
    });

    jest.advanceTimersByTime(1000);
    expect(onNearLimit).not.toHaveBeenCalled();
    expect(onHardLimitExceeded).not.toHaveBeenCalled();

    stop();
    stop();
  });

  /* Preconditions: Resource monitor starts with a PID that has no matching app metrics entry
     Action: Start the resource monitor and advance timers
     Assertions: Near-limit and hard-limit callbacks are not invoked
     Requirements: code_exec.3.7 */
  it('resource monitor returns early when process metrics for PID are absent', () => {
    jest.useFakeTimers();
    const onNearLimit = jest.fn();
    const onHardLimitExceeded = jest.fn();
    const getAppMetricsMock = app.getAppMetrics as jest.Mock;
    getAppMetricsMock.mockReturnValue([]);

    const manager = new SandboxSessionManager();
    const stop = (
      manager as unknown as {
        startResourceMonitor: (params: {
          sandboxWindow: {
            isDestroyed: () => boolean;
            webContents: {
              isDestroyed: () => boolean;
              getOSProcessId: () => number;
              setBackgroundThrottling: (value: boolean) => void;
            };
          };
          signal: AbortSignal;
          onNearLimit: () => void;
          onHardLimitExceeded: (reason: string) => void;
        }) => () => void;
      }
    ).startResourceMonitor({
      sandboxWindow: {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          getOSProcessId: () => 4242,
          setBackgroundThrottling: jest.fn(),
        },
      },
      signal: new AbortController().signal,
      onNearLimit,
      onHardLimitExceeded,
    });

    jest.advanceTimersByTime(1000);
    expect(onNearLimit).not.toHaveBeenCalled();
    expect(onHardLimitExceeded).not.toHaveBeenCalled();
    stop();
  });
});
