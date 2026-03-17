// Requirements: code_exec.1.5, code_exec.2, code_exec.3.7

jest.mock('node:fs', () => ({
  __esModule: true,
  default: {
    existsSync: jest.fn(
      (targetPath: string) =>
        targetPath ===
        '/Users/amogil/Documents/projects/clerkly/dist/preload/preload/codeExecSandbox.js'
    ),
  },
  existsSync: jest.fn(
    (targetPath: string) =>
      targetPath ===
      '/Users/amogil/Documents/projects/clerkly/dist/preload/preload/codeExecSandbox.js'
  ),
}));

jest.mock('electron', () => {
  const getAppMetrics = jest.fn(() => []);
  const getAppPath = jest.fn(() => '/Users/amogil/Documents/projects/clerkly');
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
          this.options.webPreferences?.preload ===
            `${getAppPath()}/dist/preload/preload/codeExecSandbox.js` &&
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
      (targetPath: fs.PathLike) =>
        String(targetPath) ===
        '/Users/amogil/Documents/projects/clerkly/dist/preload/preload/codeExecSandbox.js'
    );
  });

  /* Preconditions: Sandbox session manager uses Electron app path to configure preload and runtime exposes sandbox bridge when preload/session args are correct
     Action: Execute sandbox code that calls await window.tools.http_request(...)
     Assertions: http_request succeeds through the sandbox bridge and BrowserWindow preload points to dist/preload/preload/codeExecSandbox.js
     Requirements: code_exec.1.5, code_exec.2.2, sandbox-http-request.1.1, sandbox-http-request.1.2, sandbox-http-request.1.3 */
  it('uses preload bridge so sandbox code can call http_request', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-bridge', {
      task_summary: 'Fetch URL through bridge',
      code: 'const response = await window.tools.http_request({ url: "https://example.com" }); console.log(response.status);',
    });

    const lastInstance = electronMocks.browserWindowInstances.at(-1);
    expect(lastInstance?.options.webPreferences?.preload).toBe(
      '/Users/amogil/Documents/projects/clerkly/dist/preload/preload/codeExecSandbox.js'
    );
    expect(lastInstance?.options.webPreferences?.additionalArguments).toContainEqual(
      expect.stringMatching(/^--code-exec-session-id=/)
    );
    expect(electronMocks.sandboxBridgeInvokeTool).toHaveBeenCalledWith('http_request', {
      url: 'https://example.com',
    });
    expect(result.status).toBe('success');
    expect(result.stdout).toContain('200');
  });

  it('executes code and captures stdout', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      task_summary: 'Print hello',
      code: "console.log('hello')",
    });

    expect(result.status).toBe('success');
    expect(result.stdout).toContain('hello');
    expect(result.stderr).toBe('');
  });

  it('returns policy_denied for forbidden browser network API', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      task_summary: 'Try fetch',
      code: 'fetch("https://example.com")',
    });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('policy_denied');
  });

  it('returns policy_denied for globalThis browser network API access', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      task_summary: 'Try global fetch',
      code: 'globalThis.fetch("https://example.com")',
    });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('policy_denied');
  });

  it('returns policy_denied for multithreading API', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      task_summary: 'Create worker',
      code: 'new Worker("a.js")',
    });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('policy_denied');
  });

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
      controller.signal
    );

    expect(result.status).toBe('cancelled');
  });

  it('returns invalid_tool_arguments when args are invalid', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {} as Record<string, unknown>);

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('invalid_tool_arguments');
  });

  it('captures stderr from console.warn and console.error', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      task_summary: 'Write warnings',
      code: "console.warn('w'); console.error('e');",
    });

    expect(result.status).toBe('success');
    expect(result.stderr).toContain('w');
    expect(result.stderr).toContain('e');
  });

  it('returns policy_denied for forbidden tools allowlist access', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      task_summary: 'Call unknown tool',
      code: 'window.tools.someUnknownTool()',
    });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('policy_denied');
  });

  it('returns timeout with limit_exceeded when vm timeout error is thrown', async () => {
    const manager = new SandboxSessionManager();
    const result = await (
      manager as unknown as {
        executeInOneSandbox: (
          input: { taskSummary: string; code: string; timeoutMs: number },
          context: { sessionId: string; signal: AbortSignal }
        ) => Promise<{ status: string; error?: { code?: string } }>;
      }
    ).executeInOneSandbox(
      { taskSummary: 'Loop forever', code: 'while (true) {}', timeoutMs: 1 },
      { sessionId: 'timeout-test', signal: new AbortController().signal }
    );

    expect(result.status).toBe('timeout');
    expect(result.error?.code).toBe('limit_exceeded');
  });

  it('maps memory allocation failures to limit_exceeded', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      task_summary: 'Allocate large string',
      code: "const huge = 'x'.repeat(2 ** 31)",
    });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('limit_exceeded');
    expect(result.error?.message ?? '').toContain('2 GiB');
  });

  it('returns sandbox_runtime_error for generic runtime exceptions', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      task_summary: 'Throw boom',
      code: 'throw new Error("boom")',
    });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('sandbox_runtime_error');
    expect(result.error?.message).toContain('boom');
  });

  it('keeps structured forbidden_destination helper results inside stdout instead of remapping them', async () => {
    electronMocks.sandboxBridgeInvokeTool.mockResolvedValueOnce({
      error: {
        code: 'forbidden_destination',
        message: 'http_request cannot access localhost.',
      },
    });

    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      task_summary: 'Reject localhost target',
      code: `const result = await tools.http_request({ url: "http://localhost:3000/blocked" });
console.log(JSON.stringify(result));`,
    });

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
      controller.signal
    );

    setTimeout(() => controller.abort(), 5);
    const result = await promise;
    expect(result.status).toBe('cancelled');
  });

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
    const result = await manager.execute('agent-1', 'call-1', {
      task_summary: 'Wait and log ok',
      code: 'await new Promise((resolve) => setTimeout(resolve, 250)); console.log("ok")',
    });

    expect(result.status).toBe('success');
    expect(result.stderr).toContain('degraded mode');
  });

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
    const result = await manager.execute('agent-1', 'call-1', {
      task_summary: 'Stress CPU briefly',
      code: 'await new Promise((resolve) => setTimeout(resolve, 250)); console.log("ok")',
      timeout_ms: 10000,
    });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('limit_exceeded');
    expect(result.error?.message ?? '').toContain('CPU limit exceeded');
  });
});

describe('SandboxSessionManager.shutdown', () => {
  it('returns immediately when there are no active sessions', async () => {
    const manager = new SandboxSessionManager();
    await expect(manager.shutdown()).resolves.toBeUndefined();
  });

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
    expect(resolveCodeExecSandboxPreloadPath()).toBe(
      '/Users/amogil/Documents/projects/clerkly/dist/preload/preload/codeExecSandbox.js'
    );
  });

  it('prefers file-relative preload path when the current bundle layout provides it', () => {
    fsExistsSyncMock.mockImplementation(
      (targetPath: fs.PathLike) =>
        String(targetPath) ===
        '/Users/amogil/Documents/projects/clerkly/dist/preload/preload/codeExecSandbox.js'
    );

    expect(
      resolveCodeExecSandboxPreloadPath('/Users/amogil/Documents/projects/clerkly/dist/main')
    ).toBe('/Users/amogil/Documents/projects/clerkly/dist/preload/preload/codeExecSandbox.js');
  });

  it('prefers file-relative preload path when the functional bundle layout provides it', () => {
    fsExistsSyncMock.mockImplementation(
      (targetPath: fs.PathLike) =>
        String(targetPath) ===
        '/Users/amogil/Documents/projects/clerkly/dist/preload/preload/codeExecSandbox.js'
    );

    expect(
      resolveCodeExecSandboxPreloadPath('/Users/amogil/Documents/projects/clerkly/dist/main/main')
    ).toBe('/Users/amogil/Documents/projects/clerkly/dist/preload/preload/codeExecSandbox.js');
  });

  it('normalizes invalid output into internal_error', () => {
    const result = normalizeCodeExecOutput(null);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('internal_error');
  });

  it('normalizes invalid status into internal_error', () => {
    const result = normalizeCodeExecOutput({ status: 'bad-status' });
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('internal_error');
  });

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
