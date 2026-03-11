// Requirements: code_exec.1.5, code_exec.2, code_exec.3.7

jest.mock('electron', () => {
  class MockBrowserWindow {
    private destroyed = false;

    public webContents = {
      executeJavaScript: jest.fn(async (script: string) => {
        if (script.includes('while (true) {}')) {
          return await new Promise(() => undefined);
        }
        const nodeVm = require('node:vm') as typeof import('node:vm');
        return await nodeVm.runInNewContext(script, {
          setTimeout,
          clearTimeout,
          Promise,
        });
      }),
      isDestroyed: jest.fn(() => this.destroyed),
      forcefullyCrashRenderer: jest.fn(),
      setWindowOpenHandler: jest.fn(),
      on: jest.fn(),
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
  };
});

import { SandboxSessionManager } from '../../../src/main/code_exec/SandboxSessionManager';
import {
  normalizeCodeExecOutput,
  toCodeExecInput,
} from '../../../src/main/code_exec/SandboxSessionManager';

describe('SandboxSessionManager.execute', () => {
  it('executes code and captures stdout', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      code: "console.log('hello')",
    });

    expect(result.status).toBe('success');
    expect(result.stdout).toContain('hello');
    expect(result.stderr).toBe('');
  });

  it('returns policy_denied for forbidden browser network API', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      code: 'fetch("https://example.com")',
    });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('policy_denied');
  });

  it('returns policy_denied for globalThis browser network API access', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      code: 'globalThis.fetch("https://example.com")',
    });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('policy_denied');
  });

  it('returns policy_denied for multithreading API', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
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
      code: "console.warn('w'); console.error('e');",
    });

    expect(result.status).toBe('success');
    expect(result.stderr).toContain('w');
    expect(result.stderr).toContain('e');
  });

  it('returns policy_denied for forbidden tools allowlist access', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
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
          input: { code: string; timeoutMs: number },
          context: { sessionId: string; signal: AbortSignal }
        ) => Promise<{ status: string; error?: { code?: string } }>;
      }
    ).executeInOneSandbox(
      { code: 'while (true) {}', timeoutMs: 1 },
      { sessionId: 'timeout-test', signal: new AbortController().signal }
    );

    expect(result.status).toBe('timeout');
    expect(result.error?.code).toBe('limit_exceeded');
  });

  it('maps memory allocation failures to limit_exceeded', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      code: "const huge = 'x'.repeat(2 ** 31)",
    });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('limit_exceeded');
    expect(result.error?.message ?? '').toContain('2 GiB');
  });

  it('returns sandbox_runtime_error for generic runtime exceptions', async () => {
    const manager = new SandboxSessionManager();
    const result = await manager.execute('agent-1', 'call-1', {
      code: 'throw new Error("boom")',
    });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('sandbox_runtime_error');
    expect(result.error?.message).toContain('boom');
  });

  it('returns cancelled when aborted during execution', async () => {
    const manager = new SandboxSessionManager();
    const controller = new AbortController();

    const promise = manager.execute(
      'agent-1',
      'call-1',
      {
        code: 'await new Promise((resolve) => setTimeout(resolve, 30)); console.log("done")',
      },
      controller.signal
    );

    setTimeout(() => controller.abort(), 5);
    const result = await promise;
    expect(result.status).toBe('cancelled');
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
    expect(toCodeExecInput({ code: 'x', timeout_ms: 123 })).toEqual({
      code: 'x',
      timeout_ms: 123,
    });
    expect(
      toCodeExecInput({ code: 1, timeout_ms: '1' } as unknown as Record<string, unknown>)
    ).toEqual({
      code: '',
      timeout_ms: undefined,
    });
  });
});
