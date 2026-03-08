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

/**
 * Executes tool calls with bounded concurrency and deterministic output order.
 * Requirements: llm-integration.11.4
 */
export class ToolRunner implements IToolExecutor {
  constructor(
    private readonly handlers: Record<string, ToolHandler> = {},
    private readonly maxConcurrency: number = 3
  ) {}

  async executeBatch(calls: ToolCallRequest[], signal?: AbortSignal): Promise<ToolCallResult[]> {
    if (calls.length === 0) {
      return [];
    }

    const workerCount = Math.max(1, Math.min(this.maxConcurrency, calls.length));
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

    try {
      const result = await handler(call.arguments, signal);
      return {
        callId: call.callId,
        toolName: call.toolName,
        status: 'success',
        output: typeof result === 'string' ? result : JSON.stringify(result),
      };
    } catch (error) {
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
