// Requirements: code_exec.1.5, code_exec.2, code_exec.3.7

import vm from 'node:vm';
import { SandboxSessionManager } from '../../../src/main/code_exec/SandboxSessionManager';
import { CODE_EXEC_LIMITS } from '../../../src/main/code_exec/contracts';
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
    const runSpy = jest.spyOn(vm, 'runInContext').mockImplementation(() => {
      throw new Error('Script execution timed out after 10ms');
    });

    const result = await manager.execute('agent-1', 'call-1', {
      code: '42',
      timeout_ms: CODE_EXEC_LIMITS.timeoutMsMin,
    });

    expect(result.status).toBe('timeout');
    expect(result.error?.code).toBe('limit_exceeded');
    runSpy.mockRestore();
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

  it('rejects in withAbort helper when signal is already aborted', async () => {
    const manager = new SandboxSessionManager();
    const controller = new AbortController();
    controller.abort();

    await expect(
      (
        manager as unknown as {
          withAbort: <T>(promise: Promise<T>, signal?: AbortSignal) => Promise<T>;
        }
      ).withAbort(Promise.resolve('ok'), controller.signal)
    ).rejects.toThrow('aborted');
  });
});
