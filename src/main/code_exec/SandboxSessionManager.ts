// Requirements: code_exec.1.5, code_exec.2, code_exec.5

import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { Logger } from '../Logger';
import {
  CODE_EXEC_LIMITS,
  CodeExecToolInput,
  CodeExecToolOutput,
  makeCodeExecError,
  validateCodeExecInput,
} from './contracts';
import { applyStdStreamLimits } from './OutputLimiter';
import {
  SANDBOX_DOCUMENT_CSP,
  attachSandboxNavigationGuards,
  attachSandboxSessionPolicies,
} from './SandboxPolicy';
import {
  MAIN_PIPELINE_ONLY_TOOL_NAMES,
  POLICY_DENIED_MAIN_PIPELINE_TOOL_MESSAGE,
  POLICY_DENIED_TOOL_MESSAGE,
} from './SandboxBridge';
import { SandboxHttpRequestHandler } from './SandboxHttpRequestHandler';
import { SandboxWebSearchHandler } from './SandboxWebSearchHandler';
import { LLMProvider } from '../../types';

const POLICY_DENIED_NETWORK_MESSAGE =
  'Browser-level network APIs are not allowed in sandbox runtime.';
const POLICY_DENIED_MULTITHREAD_MESSAGE = 'Multithreading APIs are not allowed in sandbox runtime.';
const POLICY_DENIED_NODE_GLOBALS_MESSAGE = 'Node.js globals are not available in sandbox runtime.';
const LIMIT_EXCEEDED_MEMORY_MESSAGE = `code_exec memory limit exceeded (${Math.round(
  CODE_EXEC_LIMITS.sandboxMemoryLimitBytes / (1024 * 1024 * 1024)
)} GiB).`;
const LIMIT_EXCEEDED_CPU_MESSAGE = `code_exec CPU limit exceeded (${CODE_EXEC_LIMITS.sandboxCpuLimit} vCPU).`;
const DEGRADED_MODE_STDERR_MESSAGE =
  '[code_exec] Resource pressure detected near CPU/RAM limits. Execution continued in degraded mode.';

type SessionHandle = {
  id: string;
  cancel: () => void;
};

type SandboxToolInvoker = (input: unknown) => Promise<unknown>;

const SANDBOX_TOOL_IPC_CHANNEL = 'code-exec:sandbox-tool';

interface SandboxToolInvocationPayload {
  sessionId?: unknown;
  toolName?: unknown;
  input?: unknown;
}

// Requirements: code_exec.1.5, code_exec.2.2, sandbox-http-request.1.1-1.2
export function resolveCodeExecSandboxPreloadPath(appPath = app.getAppPath()): string {
  const candidates = [
    path.join(appPath, 'dist/preload/preload/codeExecSandbox.js'),
    path.resolve(appPath, '../../preload/preload/codeExecSandbox.js'),
    path.resolve(appPath, '../preload/preload/codeExecSandbox.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(appPath, 'dist/preload/preload/codeExecSandbox.js');
}

const TEST_HTTP_REQUEST_LOOPBACK_ALLOWLIST = ['127.0.0.1'];

// Requirements: code_exec.1.5, code_exec.2.5-2.6, code_exec.2.10
export class SandboxSessionManager {
  private static isSandboxToolHandlerRegistered = false;
  private logger = Logger.create('SandboxSessionManager');
  private activeSessions = new Map<string, SessionHandle>();
  private activeSandboxToolInvokers = new Map<string, Map<string, SandboxToolInvoker>>();

  constructor(
    private readonly httpRequestHandler = new SandboxHttpRequestHandler(
      undefined,
      undefined,
      process.env.NODE_ENV === 'test'
        ? new Set(TEST_HTTP_REQUEST_LOOPBACK_ALLOWLIST)
        : new Set<string>()
    )
  ) {
    this.registerSandboxToolHandler();
  }

  // Requirements: code_exec.1.2, code_exec.2.3, code_exec.3.7
  async execute(
    agentId: string,
    callId: string,
    args: Record<string, unknown>,
    provider: LLMProvider,
    apiKey: string,
    signal?: AbortSignal
  ): Promise<CodeExecToolOutput> {
    const validated = validateCodeExecInput(args);
    if (!validated.ok) {
      return makeCodeExecError(
        validated.error?.code ?? 'invalid_tool_arguments',
        validated.error?.message ?? 'Invalid code_exec arguments.'
      );
    }

    const cancelController = new AbortController();
    const onAbort = () => cancelController.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      cancelController.abort();
    }

    const sessionId = `${agentId}:${callId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const handle = this.createSessionHandle(sessionId, () => cancelController.abort());
    this.activeSessions.set(sessionId, handle);

    try {
      return await this.executeInOneSandbox(
        validated.value as { taskSummary: string; code: string; timeoutMs: number },
        {
          sessionId,
          provider,
          apiKey,
          signal: cancelController.signal,
        }
      );
    } finally {
      signal?.removeEventListener('abort', onAbort);
      this.activeSessions.delete(sessionId);
      this.activeSandboxToolInvokers.delete(sessionId);
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
    this.activeSandboxToolInvokers.clear();
  }

  private createSessionHandle(id: string, cancelImpl: () => void): SessionHandle {
    return {
      id,
      cancel: () => {
        cancelImpl();
        this.logger.info(`Sandbox session cancelled: ${id}`);
      },
    };
  }

  private registerSandboxToolHandler(): void {
    if (SandboxSessionManager.isSandboxToolHandlerRegistered || !ipcMain?.handle) {
      return;
    }

    ipcMain.handle(
      SANDBOX_TOOL_IPC_CHANNEL,
      async (_event, payload: SandboxToolInvocationPayload) =>
        this.handleSandboxToolInvocation(payload)
    );
    SandboxSessionManager.isSandboxToolHandlerRegistered = true;
  }

  private async handleSandboxToolInvocation(
    payload: SandboxToolInvocationPayload
  ): Promise<unknown> {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const toolName = typeof payload.toolName === 'string' ? payload.toolName : '';
    const invokers = this.activeSandboxToolInvokers.get(sessionId);
    if (!invokers) {
      return {
        error: {
          code: 'internal_error',
          message: 'Sandbox tool invocation is not available for this session.',
        },
      };
    }
    const invoker = invokers.get(toolName);
    if (!invoker) {
      return {
        error: {
          code: 'policy_denied',
          message: 'Tool is not available for the active provider capability.',
        },
      };
    }

    return await invoker(payload.input);
  }

  private async executeInOneSandbox(
    input: { taskSummary: string; code: string; timeoutMs: number },
    context: { sessionId: string; provider: LLMProvider; apiKey: string; signal: AbortSignal }
  ): Promise<CodeExecToolOutput> {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let degradedModeApplied = false;
    let hardLimitReason: string | null = null;

    const partition = `code_exec_${context.sessionId}`;
    const sandboxSession = session.fromPartition(partition, { cache: false });
    attachSandboxSessionPolicies(sandboxSession);

    const preloadPath = resolveCodeExecSandboxPreloadPath();

    const sandboxWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: preloadPath,
        additionalArguments: [`--code-exec-session-id=${context.sessionId}`],
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: true,
        webSecurity: true,
        session: sandboxSession,
      },
    });
    attachSandboxNavigationGuards(sandboxWindow.webContents);

    const invokers = new Map<string, SandboxToolInvoker>([
      ['http_request', async (toolInput: unknown) => this.httpRequestHandler.execute(toolInput)],
    ]);

    // Requirements: sandbox-web-search.1.6
    if (this.isWebSearchSupported(context.provider)) {
      const webSearchHandler = new SandboxWebSearchHandler(context.provider, context.apiKey);
      invokers.set('web_search', async (toolInput: unknown) => webSearchHandler.execute(toolInput));
    }

    this.activeSandboxToolInvokers.set(context.sessionId, invokers);

    const destroySandboxWindow = () => {
      try {
        if (!sandboxWindow.webContents.isDestroyed()) {
          sandboxWindow.webContents.forcefullyCrashRenderer();
        }
      } catch {
        // Best effort renderer termination.
      }
      if (!sandboxWindow.isDestroyed()) {
        sandboxWindow.destroy();
      }
    };
    let stopMonitor: (() => void) | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
      if (context.signal.aborted) {
        destroySandboxWindow();
        return this.finalizeOutput('cancelled', stdoutChunks, stderrChunks);
      }

      await sandboxWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${SANDBOX_DOCUMENT_CSP}"></head><body></body></html>`
        )}`
      );

      let resourceLimitReject: ((reason?: unknown) => void) | null = null;
      const resourceLimitPromise = new Promise<never>((_, reject) => {
        resourceLimitReject = reject;
      });
      stopMonitor = this.startResourceMonitor({
        sandboxWindow,
        signal: context.signal,
        onNearLimit: () => {
          degradedModeApplied = true;
        },
        onHardLimitExceeded: (reason) => {
          hardLimitReason = this.extractResourceLimitMessage(reason);
          destroySandboxWindow();
          resourceLimitReject?.(new Error(reason));
        },
      });

      const executionScript = this.buildSandboxExecutionScript(
        input.code,
        Array.from(invokers.keys())
      );
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('code_exec_timeout')), input.timeoutMs);
      });
      const abortPromise = new Promise<never>((_, reject) => {
        const abortNow = () => {
          destroySandboxWindow();
          reject(new Error('code_exec_cancelled'));
        };
        if (context.signal.aborted) {
          abortNow();
          return;
        }
        const onAbort = () => abortNow();
        context.signal.addEventListener('abort', onAbort, { once: true });
      });

      const runtimePromise = sandboxWindow.webContents.executeJavaScript(executionScript, true);
      const result = await Promise.race([
        runtimePromise,
        timeoutPromise,
        resourceLimitPromise,
        abortPromise,
      ]);

      if (context.signal.aborted) {
        return this.finalizeOutput('cancelled', stdoutChunks, stderrChunks);
      }

      const normalized = normalizeCodeExecOutput(result);
      const limited = applyStdStreamLimits(normalized.stdout, normalized.stderr);
      const remappedError =
        normalized.error?.code === 'sandbox_runtime_error' &&
        typeof normalized.error?.message === 'string'
          ? this.isMemoryLimitError(normalized.error.message)
            ? {
                code: 'limit_exceeded' as const,
                message: `${LIMIT_EXCEEDED_MEMORY_MESSAGE} ${normalized.error.message}`,
              }
            : this.isNetworkPolicyLikeError(normalized.error.message)
              ? {
                  code: 'policy_denied' as const,
                  message: POLICY_DENIED_NETWORK_MESSAGE,
                }
              : this.isNodeGlobalsPolicyLikeError(normalized.error.message)
                ? {
                    code: 'policy_denied' as const,
                    message: POLICY_DENIED_NODE_GLOBALS_MESSAGE,
                  }
                : normalized.error
          : normalized.error;
      const base = {
        ...normalized,
        stdout: limited.stdout,
        stderr: limited.stderr,
        stdout_truncated: limited.stdout_truncated,
        stderr_truncated: limited.stderr_truncated,
        ...(remappedError ? { error: remappedError } : {}),
      };
      return this.appendDegradedDiagnostic(base, degradedModeApplied);
    } catch (error) {
      if (context.signal.aborted) {
        return this.finalizeOutput('cancelled', stdoutChunks, stderrChunks);
      }

      const message = error instanceof Error ? error.message : String(error);
      if (hardLimitReason) {
        const base = this.finalizeOutput('error', stdoutChunks, stderrChunks);
        return {
          ...base,
          error: {
            code: 'limit_exceeded',
            message: hardLimitReason,
          },
        };
      }
      if (this.isResourceLimitHardError(message)) {
        const base = this.finalizeOutput('error', stdoutChunks, stderrChunks);
        return {
          ...base,
          error: {
            code: 'limit_exceeded',
            message: this.extractResourceLimitMessage(message),
          },
        };
      }
      if (message.includes('code_exec_timeout')) {
        destroySandboxWindow();
        const base = this.finalizeOutput('timeout', stdoutChunks, stderrChunks);
        return {
          ...base,
          error: {
            code: 'limit_exceeded',
            message: `code_exec timeout limit exceeded (${input.timeoutMs} ms).`,
          },
        };
      }
      if (message.includes('code_exec_cancelled')) {
        return this.finalizeOutput('cancelled', stdoutChunks, stderrChunks);
      }
      if (this.isMemoryLimitError(message)) {
        const base = this.finalizeOutput('error', stdoutChunks, stderrChunks);
        return {
          ...base,
          error: {
            code: 'limit_exceeded',
            message: `${LIMIT_EXCEEDED_MEMORY_MESSAGE} ${message}`,
          },
        };
      }
      if (this.isNodeGlobalsPolicyLikeError(message)) {
        const base = this.finalizeOutput('error', stdoutChunks, stderrChunks);
        return {
          ...base,
          error: {
            code: 'policy_denied',
            message: POLICY_DENIED_NODE_GLOBALS_MESSAGE,
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
    } finally {
      stopMonitor?.();
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      destroySandboxWindow();
      void sandboxSession.clearStorageData().catch(() => undefined);
    }
  }

  // Requirements: code_exec.2.3, code_exec.2.7-2.9, code_exec.3.7
  private buildSandboxExecutionScript(code: string, allowedTools: string[]): string {
    const escapedCode = JSON.stringify(code);
    return `
      (async () => {
        const POLICY_DENIED_NETWORK_MESSAGE = ${JSON.stringify(POLICY_DENIED_NETWORK_MESSAGE)};
        const POLICY_DENIED_MULTITHREAD_MESSAGE = ${JSON.stringify(POLICY_DENIED_MULTITHREAD_MESSAGE)};
        const POLICY_DENIED_MAIN_PIPELINE_TOOL_MESSAGE = ${JSON.stringify(POLICY_DENIED_MAIN_PIPELINE_TOOL_MESSAGE)};
        const POLICY_DENIED_TOOL_ALLOWLIST_MESSAGE = ${JSON.stringify(POLICY_DENIED_TOOL_MESSAGE)};
        const MAIN_PIPELINE_ONLY_TOOLS = new Set(${JSON.stringify(MAIN_PIPELINE_ONLY_TOOL_NAMES)});
        const SANDBOX_TOOLS_ALLOWLIST = new Set(${JSON.stringify(allowedTools)});
        const sandboxBridge =
          typeof globalThis.__sandboxBridge === 'object' &&
          globalThis.__sandboxBridge &&
          typeof globalThis.__sandboxBridge.invokeTool === 'function'
            ? globalThis.__sandboxBridge
            : null;
        const stdoutChunks = [];
        const stderrChunks = [];

        const toLine = (args) =>
          args
            .map((value) => {
              if (typeof value === 'string') return value;
              try {
                return JSON.stringify(value);
              } catch {
                return String(value);
              }
            })
            .join(' ') + '\\n';

        const denyPolicy = (message) => {
          throw new Error('policy_denied::' + message);
        };
        const deniedNetworkApi = () => denyPolicy(POLICY_DENIED_NETWORK_MESSAGE);
        const ForbiddenWorkerApi = function ForbiddenWorkerApi() {
          denyPolicy(POLICY_DENIED_MULTITHREAD_MESSAGE);
        };
        const toolsProxy = new Proxy(
          {},
          {
            get(_target, property) {
              if (typeof property !== 'string') {
                return undefined;
              }
              return (input) => {
                if (MAIN_PIPELINE_ONLY_TOOLS.has(property)) {
                  denyPolicy(POLICY_DENIED_MAIN_PIPELINE_TOOL_MESSAGE);
                }
                if (!SANDBOX_TOOLS_ALLOWLIST.has(property)) {
                  denyPolicy(POLICY_DENIED_TOOL_ALLOWLIST_MESSAGE);
                }
                if (!sandboxBridge) {
                  throw new Error('sandbox_runtime_error::Sandbox tool bridge is unavailable.');
                }
                return sandboxBridge.invokeTool(property, input);
              };
            },
          }
        );

        const locationProxy = {
          assign: () => denyPolicy(POLICY_DENIED_NETWORK_MESSAGE),
          replace: () => denyPolicy(POLICY_DENIED_NETWORK_MESSAGE),
        };
        const windowProxy = {
          open: () => denyPolicy(POLICY_DENIED_NETWORK_MESSAGE),
          tools: toolsProxy,
          location: locationProxy,
          fetch: deniedNetworkApi,
          XMLHttpRequest: function ForbiddenXMLHttpRequest() {
            denyPolicy(POLICY_DENIED_NETWORK_MESSAGE);
          },
          WebSocket: function ForbiddenWebSocket() {
            denyPolicy(POLICY_DENIED_NETWORK_MESSAGE);
          },
        };
        const navigatorProxy = {
          sendBeacon: deniedNetworkApi,
        };
        const consoleProxy = {
          log: (...args) => stdoutChunks.push(toLine(args)),
          info: (...args) => stdoutChunks.push(toLine(args)),
          warn: (...args) => stderrChunks.push(toLine(args)),
          error: (...args) => stderrChunks.push(toLine(args)),
        };
        const safeDefine = (target, property, value) => {
          try {
            Object.defineProperty(target, property, {
              configurable: true,
              writable: true,
              value,
            });
            return;
          } catch {
            // Fallback assignment path for configurable globals.
          }
          try {
            target[property] = value;
          } catch {
            // Best effort hardening.
          }
        };
        const hardenGlobalApis = () => {
          safeDefine(globalThis, 'fetch', deniedNetworkApi);
          safeDefine(globalThis, 'XMLHttpRequest', windowProxy.XMLHttpRequest);
          safeDefine(globalThis, 'WebSocket', windowProxy.WebSocket);
          safeDefine(globalThis, 'Worker', ForbiddenWorkerApi);
          safeDefine(globalThis, 'SharedWorker', ForbiddenWorkerApi);
          safeDefine(globalThis, 'ServiceWorker', ForbiddenWorkerApi);
          safeDefine(globalThis, 'Worklet', ForbiddenWorkerApi);
          safeDefine(globalThis, 'tools', toolsProxy);

          if (typeof globalThis.window === 'object' && globalThis.window) {
            safeDefine(globalThis.window, 'open', windowProxy.open);
            safeDefine(globalThis.window, 'fetch', deniedNetworkApi);
            safeDefine(globalThis.window, 'XMLHttpRequest', windowProxy.XMLHttpRequest);
            safeDefine(globalThis.window, 'WebSocket', windowProxy.WebSocket);
            safeDefine(globalThis.window, 'tools', toolsProxy);
          }

          if (typeof globalThis.location === 'object' && globalThis.location) {
            safeDefine(globalThis.location, 'assign', locationProxy.assign);
            safeDefine(globalThis.location, 'replace', locationProxy.replace);
          }

          if (typeof globalThis.navigator === 'object' && globalThis.navigator) {
            safeDefine(globalThis.navigator, 'sendBeacon', deniedNetworkApi);
          }
        };

        try {
          hardenGlobalApis();
          const userCode = ${escapedCode};
          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
          const fn = new AsyncFunction(
            'console',
            'window',
            'location',
            'fetch',
            'XMLHttpRequest',
            'WebSocket',
            'navigator',
            'Worker',
            'SharedWorker',
            'ServiceWorker',
            'Worklet',
            'setTimeout',
            'clearTimeout',
            '"use strict";\\n' + userCode
          );
          const result = await fn(
            consoleProxy,
            windowProxy,
            locationProxy,
            deniedNetworkApi,
            windowProxy.XMLHttpRequest,
            windowProxy.WebSocket,
            navigatorProxy,
            ForbiddenWorkerApi,
            ForbiddenWorkerApi,
            ForbiddenWorkerApi,
            ForbiddenWorkerApi,
            setTimeout,
            clearTimeout
          );
          if (typeof result !== 'undefined') {
            stdoutChunks.push(String(result) + '\\n');
          }
          return {
            status: 'success',
            stdout: stdoutChunks.join(''),
            stderr: stderrChunks.join(''),
            stdout_truncated: false,
            stderr_truncated: false,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.startsWith('policy_denied::')) {
            return {
              status: 'error',
              stdout: stdoutChunks.join(''),
              stderr: stderrChunks.join(''),
              stdout_truncated: false,
              stderr_truncated: false,
              error: {
                code: 'policy_denied',
                message: message.replace('policy_denied::', ''),
              },
            };
          }
          return {
            status: 'error',
            stdout: stdoutChunks.join(''),
            stderr: stderrChunks.join(''),
            stdout_truncated: false,
            stderr_truncated: false,
            error: {
              code: 'sandbox_runtime_error',
              message,
            },
          };
        }
      })();
    `;
  }

  // Requirements: code_exec.2.11.3, code_exec.3.1.2.3.1
  private isMemoryLimitError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('heap out of memory') ||
      lower.includes('allocation failed') ||
      lower.includes('invalid array length') ||
      lower.includes('invalid string length')
    );
  }

  // Requirements: code_exec.2.3.2
  private isNetworkPolicyLikeError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('policy_denied') ||
      lower.includes('xmlhttprequest') ||
      lower.includes('websocket') ||
      lower.includes('sendbeacon') ||
      lower.includes('network apis are not allowed')
    );
  }

  // Requirements: code_exec.2.4, code_exec.3.5
  private isNodeGlobalsPolicyLikeError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      /\b(process|require|module|buffer|__dirname|__filename)\b is not defined/.test(lower) ||
      lower.includes('node.js globals are not available')
    );
  }

  private isResourceLimitHardError(message: string): boolean {
    return message.startsWith('code_exec_resource_limit_exceeded::');
  }

  private extractResourceLimitMessage(message: string): string {
    return message.replace('code_exec_resource_limit_exceeded::', '');
  }

  private startResourceMonitor(params: {
    sandboxWindow: BrowserWindow;
    signal: AbortSignal;
    onNearLimit: () => void;
    onHardLimitExceeded: (reason: string) => void;
  }): () => void {
    const cpuSoftLimitPercent = CODE_EXEC_LIMITS.sandboxCpuLimit * 100 * 0.85;
    const cpuHardLimitPercent = CODE_EXEC_LIMITS.sandboxCpuLimit * 120;
    const memorySoftLimitBytes = CODE_EXEC_LIMITS.sandboxMemoryLimitBytes * 0.9;
    const memoryHardLimitBytes = CODE_EXEC_LIMITS.sandboxMemoryLimitBytes;

    let isStopped = false;
    let nearLimitMarked = false;

    const interval = setInterval(() => {
      if (isStopped || params.signal.aborted || params.sandboxWindow.isDestroyed()) {
        return;
      }

      const webContents = params.sandboxWindow.webContents;
      if (webContents.isDestroyed()) {
        return;
      }

      const pid = webContents.getOSProcessId();
      if (!pid || pid <= 0) {
        return;
      }

      const metrics = app.getAppMetrics();
      const processMetric = metrics.find((metric) => metric.pid === pid);
      if (!processMetric) {
        return;
      }

      const cpuPercent = processMetric.cpu?.percentCPUUsage ?? 0;
      const memoryBytes = (processMetric.memory?.workingSetSize ?? 0) * 1024;
      const nearLimit = cpuPercent >= cpuSoftLimitPercent || memoryBytes >= memorySoftLimitBytes;
      const hardExceeded = cpuPercent > cpuHardLimitPercent || memoryBytes > memoryHardLimitBytes;

      if (nearLimit && !nearLimitMarked) {
        nearLimitMarked = true;
        params.onNearLimit();
        try {
          webContents.setBackgroundThrottling(true);
        } catch {
          // Best effort containment.
        }
      }

      if (hardExceeded) {
        const reason =
          cpuPercent > cpuHardLimitPercent
            ? `${LIMIT_EXCEEDED_CPU_MESSAGE} Observed ${cpuPercent.toFixed(1)}%.`
            : `${LIMIT_EXCEEDED_MEMORY_MESSAGE} Observed ${Math.round(
                memoryBytes / (1024 * 1024 * 1024)
              )} GiB.`;
        params.onHardLimitExceeded(`code_exec_resource_limit_exceeded::${reason}`);
      }
    }, CODE_EXEC_LIMITS.monitorIntervalMs);

    return () => {
      if (isStopped) {
        return;
      }
      isStopped = true;
      clearInterval(interval);
    };
  }

  private appendDegradedDiagnostic(
    output: CodeExecToolOutput,
    degradedModeApplied: boolean
  ): CodeExecToolOutput {
    if (!degradedModeApplied) {
      return output;
    }
    if (output.error?.code === 'limit_exceeded' || output.status === 'timeout') {
      return output;
    }
    const nextStderr = output.stderr
      ? `${output.stderr}${DEGRADED_MODE_STDERR_MESSAGE}\n`
      : `${DEGRADED_MODE_STDERR_MESSAGE}\n`;
    const limited = applyStdStreamLimits(output.stdout, nextStderr);
    return {
      ...output,
      stdout: limited.stdout,
      stderr: limited.stderr,
      stdout_truncated: limited.stdout_truncated,
      stderr_truncated: limited.stderr_truncated,
    };
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

  // Requirements: sandbox-web-search.1.6
  private isWebSearchSupported(provider: LLMProvider): boolean {
    const disabledProvidersRaw = process.env.CLERKLY_DISABLE_WEB_SEARCH_PROVIDERS ?? '';
    const disabledProviders = new Set(
      disabledProvidersRaw
        .split(',')
        .map((value) => value.trim())
        .filter((value): value is LLMProvider => {
          return value === 'openai' || value === 'google' || value === 'anthropic';
        })
    );
    if (disabledProviders.has(provider)) {
      return false;
    }
    return provider === 'openai' || provider === 'google' || provider === 'anthropic';
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
    task_summary: typeof args.task_summary === 'string' ? args.task_summary : '',
    code: typeof args.code === 'string' ? args.code : '',
    timeout_ms: typeof args.timeout_ms === 'number' ? args.timeout_ms : undefined,
  };
}
