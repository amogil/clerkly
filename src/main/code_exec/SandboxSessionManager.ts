// Requirements: code_exec.1.5, code_exec.2, code_exec.5

import vm from 'node:vm';
import { Logger } from '../Logger';
import {
  CODE_EXEC_LIMITS,
  CodeExecToolInput,
  CodeExecToolOutput,
  makeCodeExecError,
  validateCodeExecInput,
} from './contracts';
import { applyStdStreamLimits } from './OutputLimiter';
import { createSandboxToolsProxy } from './SandboxBridge';

const POLICY_DENIED_NETWORK_MESSAGE =
  'Browser-level network APIs are not allowed in sandbox runtime.';
const POLICY_DENIED_MULTITHREAD_MESSAGE = 'Multithreading APIs are not allowed in sandbox runtime.';

type SessionHandle = {
  id: string;
  cancel: () => void;
};

// Requirements: code_exec.1.5, code_exec.2.5-2.6, code_exec.2.10
export class SandboxSessionManager {
  private logger = Logger.create('SandboxSessionManager');
  private activeSessions = new Map<string, SessionHandle>();

  // Requirements: code_exec.1.2, code_exec.2.3, code_exec.3.7
  async execute(
    agentId: string,
    callId: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<CodeExecToolOutput> {
    const validated = validateCodeExecInput(args);
    if (!validated.ok) {
      return makeCodeExecError(
        validated.error?.code ?? 'invalid_tool_arguments',
        validated.error?.message ?? 'Invalid code_exec arguments.'
      );
    }

    const sessionId = `${agentId}:${callId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const handle = this.createSessionHandle(sessionId);
    this.activeSessions.set(sessionId, handle);

    try {
      return await this.executeInOneSandbox(
        validated.value as { code: string; timeoutMs: number },
        signal
      );
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  // Requirements: code_exec.2.10.1
  async shutdown(): Promise<void> {
    const sessions = Array.from(this.activeSessions.values());
    if (sessions.length === 0) {
      return;
    }

    await Promise.race([
      Promise.all(
        sessions.map(async (session) => {
          try {
            session.cancel();
          } catch {
            // Best effort cleanup.
          }
        })
      ),
      new Promise<void>((resolve) => {
        setTimeout(resolve, CODE_EXEC_LIMITS.shutdownTimeoutMs);
      }),
    ]);

    this.activeSessions.clear();
  }

  private createSessionHandle(id: string): SessionHandle {
    return {
      id,
      cancel: () => {
        this.logger.info(`Sandbox session cancelled: ${id}`);
      },
    };
  }

  private async executeInOneSandbox(
    input: { code: string; timeoutMs: number },
    signal?: AbortSignal
  ): Promise<CodeExecToolOutput> {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const denyPolicy = (message: string): never => {
      throw new Error(`policy_denied::${message}`);
    };

    const deniedNetworkApi = () => denyPolicy(POLICY_DENIED_NETWORK_MESSAGE);

    const toolsProxy = createSandboxToolsProxy(denyPolicy);

    const locationProxy = {
      assign: () => denyPolicy(POLICY_DENIED_NETWORK_MESSAGE),
      replace: () => denyPolicy(POLICY_DENIED_NETWORK_MESSAGE),
    };

    const context = vm.createContext({
      console: {
        log: (...args: unknown[]) => stdoutChunks.push(args.map(String).join(' ') + '\n'),
        info: (...args: unknown[]) => stdoutChunks.push(args.map(String).join(' ') + '\n'),
        warn: (...args: unknown[]) => stderrChunks.push(args.map(String).join(' ') + '\n'),
        error: (...args: unknown[]) => stderrChunks.push(args.map(String).join(' ') + '\n'),
      },
      fetch: deniedNetworkApi,
      XMLHttpRequest: function ForbiddenXMLHttpRequest() {
        denyPolicy(POLICY_DENIED_NETWORK_MESSAGE);
      },
      WebSocket: function ForbiddenWebSocket() {
        denyPolicy(POLICY_DENIED_NETWORK_MESSAGE);
      },
      navigator: {
        sendBeacon: deniedNetworkApi,
      },
      window: {
        open: () => denyPolicy(POLICY_DENIED_NETWORK_MESSAGE),
        tools: toolsProxy,
        location: locationProxy,
      },
      location: locationProxy,
      Worker: function ForbiddenWorker() {
        denyPolicy(POLICY_DENIED_MULTITHREAD_MESSAGE);
      },
      SharedWorker: function ForbiddenSharedWorker() {
        denyPolicy(POLICY_DENIED_MULTITHREAD_MESSAGE);
      },
      ServiceWorker: function ForbiddenServiceWorker() {
        denyPolicy(POLICY_DENIED_MULTITHREAD_MESSAGE);
      },
      Worklet: function ForbiddenWorklet() {
        denyPolicy(POLICY_DENIED_MULTITHREAD_MESSAGE);
      },
      setTimeout,
      clearTimeout,
    });

    try {
      if (signal?.aborted) {
        return this.finalizeOutput('cancelled', stdoutChunks, stderrChunks);
      }

      const runtimePromise = Promise.resolve(
        vm.runInContext(`"use strict";\n(async () => {\n${input.code}\n})()`, context, {
          timeout: input.timeoutMs,
        })
      );

      const result = await this.withAbort(runtimePromise, signal);
      if (typeof result !== 'undefined') {
        stdoutChunks.push(`${String(result)}\n`);
      }

      return this.finalizeOutput('success', stdoutChunks, stderrChunks);
    } catch (error) {
      if (signal?.aborted) {
        return this.finalizeOutput('cancelled', stdoutChunks, stderrChunks);
      }

      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('policy_denied::')) {
        const policyMessage = message.replace('policy_denied::', '');
        const base = this.finalizeOutput('error', stdoutChunks, stderrChunks);
        return {
          ...base,
          error: {
            code: 'policy_denied',
            message: policyMessage,
          },
        };
      }

      if (message.includes('Script execution timed out')) {
        const base = this.finalizeOutput('timeout', stdoutChunks, stderrChunks);
        return {
          ...base,
          error: {
            code: 'limit_exceeded',
            message: `code_exec timeout limit exceeded (${input.timeoutMs} ms).`,
          },
        };
      }

      const base = this.finalizeOutput('error', stdoutChunks, stderrChunks);
      return {
        ...base,
        error: {
          code: 'sandbox_runtime_error',
          message,
        },
      };
    }
  }

  private finalizeOutput(
    status: CodeExecToolOutput['status'],
    stdoutChunks: string[],
    stderrChunks: string[]
  ): CodeExecToolOutput {
    const limited = applyStdStreamLimits(stdoutChunks.join(''), stderrChunks.join(''));
    return {
      status,
      stdout: limited.stdout,
      stderr: limited.stderr,
      stdout_truncated: limited.stdout_truncated,
      stderr_truncated: limited.stderr_truncated,
    };
  }

  private withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
      return promise;
    }

    if (signal.aborted) {
      return Promise.reject(new Error('aborted'));
    }

    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new Error('aborted'));
      signal.addEventListener('abort', onAbort, { once: true });

      promise
        .then((value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        })
        .catch((error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        });
    });
  }
}

// Requirements: code_exec.3.1.2
export function normalizeCodeExecOutput(output: unknown): CodeExecToolOutput {
  if (!output || typeof output !== 'object') {
    return makeCodeExecError('internal_error', 'code_exec returned invalid output object.');
  }

  const raw = output as Partial<CodeExecToolOutput>;
  const status = raw.status;
  if (
    status !== 'running' &&
    status !== 'success' &&
    status !== 'error' &&
    status !== 'timeout' &&
    status !== 'cancelled'
  ) {
    return makeCodeExecError('internal_error', 'code_exec returned invalid status.');
  }

  return {
    status,
    stdout: typeof raw.stdout === 'string' ? raw.stdout : '',
    stderr: typeof raw.stderr === 'string' ? raw.stderr : '',
    stdout_truncated: Boolean(raw.stdout_truncated),
    stderr_truncated: Boolean(raw.stderr_truncated),
    ...(raw.error && typeof raw.error === 'object' ? { error: raw.error } : {}),
  };
}

// Requirements: code_exec.3.1.1
export function toCodeExecInput(args: Record<string, unknown>): CodeExecToolInput {
  return {
    code: typeof args.code === 'string' ? args.code : '',
    timeout_ms: typeof args.timeout_ms === 'number' ? args.timeout_ms : undefined,
  };
}
