// Requirements: llm-integration.11

export interface ToolCallRequest {
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export type ToolExecutionStatus = 'success' | 'error' | 'policy_denied';

export interface ToolCallResult {
  callId: string;
  toolName: string;
  status: ToolExecutionStatus;
  output: string;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  signal?: AbortSignal
) => Promise<unknown> | unknown;

export interface IToolExecutor {
  executeBatch(calls: ToolCallRequest[], signal?: AbortSignal): Promise<ToolCallResult[]>;
}

export interface ToolRunnerPolicy {
  maxConcurrency: number;
  timeoutMs: number;
  maxRetries: number;
}

const DEFAULT_POLICY: ToolRunnerPolicy = {
  maxConcurrency: 3,
  timeoutMs: 30_000,
  maxRetries: 0,
};

/**
 * Executes tool calls with bounded concurrency and deterministic output order.
 * Requirements: llm-integration.11.4
 */
export class ToolRunner implements IToolExecutor {
  private readonly policy: ToolRunnerPolicy;

  constructor(
    private readonly handlers: Record<string, ToolHandler> = {},
    maxConcurrencyOrPolicy: number | Partial<ToolRunnerPolicy> = DEFAULT_POLICY.maxConcurrency
  ) {
    if (typeof maxConcurrencyOrPolicy === 'number') {
      this.policy = {
        ...DEFAULT_POLICY,
        maxConcurrency: this.normalizePositiveInt(
          maxConcurrencyOrPolicy,
          DEFAULT_POLICY.maxConcurrency
        ),
      };
      return;
    }

    this.policy = {
      maxConcurrency: this.normalizePositiveInt(
        maxConcurrencyOrPolicy.maxConcurrency ?? DEFAULT_POLICY.maxConcurrency,
        DEFAULT_POLICY.maxConcurrency
      ),
      timeoutMs: this.normalizePositiveInt(
        maxConcurrencyOrPolicy.timeoutMs ?? DEFAULT_POLICY.timeoutMs,
        DEFAULT_POLICY.timeoutMs
      ),
      maxRetries: this.normalizeNonNegativeInt(
        maxConcurrencyOrPolicy.maxRetries ?? DEFAULT_POLICY.maxRetries,
        DEFAULT_POLICY.maxRetries
      ),
    };
  }

  async executeBatch(calls: ToolCallRequest[], signal?: AbortSignal): Promise<ToolCallResult[]> {
    if (calls.length === 0) {
      return [];
    }

    const workerCount = Math.max(1, Math.min(this.policy.maxConcurrency, calls.length));
    const pending = [...calls];
    const results: ToolCallResult[] = [];

    const worker = async (): Promise<void> => {
      for (;;) {
        if (signal?.aborted) {
          return;
        }

        const next = pending.shift();
        if (!next) {
          return;
        }

        results.push(await this.executeOne(next, signal));
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results.sort((a, b) => a.callId.localeCompare(b.callId));
  }

  private async executeOne(call: ToolCallRequest, signal?: AbortSignal): Promise<ToolCallResult> {
    const handler = this.handlers[call.toolName];
    if (!handler) {
      return {
        callId: call.callId,
        toolName: call.toolName,
        status: 'policy_denied',
        output: `Tool "${call.toolName}" is not available.`,
      };
    }

    let attempt = 0;
    const maxAttempts = this.policy.maxRetries + 1;
    for (;;) {
      try {
        const result = await this.executeWithTimeout(call, handler, signal);
        return {
          callId: call.callId,
          toolName: call.toolName,
          status: 'success',
          output: typeof result === 'string' ? result : JSON.stringify(result),
        };
      } catch (error) {
        const canRetry = !signal?.aborted && attempt + 1 < maxAttempts;
        if (canRetry) {
          attempt += 1;
          continue;
        }

        const message = error instanceof Error ? error.message : String(error);
        return {
          callId: call.callId,
          toolName: call.toolName,
          status: 'error',
          output: message,
        };
      }
    }
  }

  private async executeWithTimeout(
    call: ToolCallRequest,
    handler: ToolHandler,
    signal?: AbortSignal
  ): Promise<unknown> {
    const timeoutController = new AbortController();
    const linkedAbort = () => timeoutController.abort();
    signal?.addEventListener('abort', linkedAbort);

    const timer = setTimeout(() => timeoutController.abort(), this.policy.timeoutMs);

    try {
      return await handler(call.arguments, timeoutController.signal);
    } catch (error) {
      if (timeoutController.signal.aborted && !signal?.aborted) {
        throw new Error(`Tool "${call.toolName}" timed out after ${this.policy.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', linkedAbort);
    }
  }

  private normalizePositiveInt(value: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : fallback;
  }

  private normalizeNonNegativeInt(value: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    const normalized = Math.floor(value);
    return normalized >= 0 ? normalized : fallback;
  }
}
