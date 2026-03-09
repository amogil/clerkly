// Requirements: llm-integration.11

import { ToolRunner, type ToolCallRequest } from '../../../src/main/tools/ToolRunner';

describe('ToolRunner', () => {
  it('returns policy_denied for unknown tools', async () => {
    const runner = new ToolRunner({}, 3);
    const results = await runner.executeBatch(
      [{ callId: 'call-1', toolName: 'missing_tool', arguments: {} }],
      undefined
    );

    expect(results).toEqual([
      {
        callId: 'call-1',
        toolName: 'missing_tool',
        status: 'policy_denied',
        output: 'Tool "missing_tool" is not available.',
      },
    ]);
  });

  it('keeps deterministic order by call_id for parallel execution', async () => {
    const calls: ToolCallRequest[] = [
      { callId: 'call-b', toolName: 'sleep', arguments: { ms: 20, value: 'B' } },
      { callId: 'call-a', toolName: 'sleep', arguments: { ms: 1, value: 'A' } },
    ];

    const runner = new ToolRunner(
      {
        sleep: async (args) => {
          const ms = Number(args.ms ?? 0);
          await new Promise((resolve) => setTimeout(resolve, ms));
          return args.value;
        },
      },
      3
    );

    const results = await runner.executeBatch(calls);

    expect(results.map((r) => r.callId)).toEqual(['call-a', 'call-b']);
    expect(results.map((r) => r.output)).toEqual(['A', 'B']);
  });

  it('retries failed tool execution up to maxRetries and returns success when retry passes', async () => {
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ ok: true });
    const runner = new ToolRunner(
      {
        flaky_tool: handler,
      },
      { maxConcurrency: 1, timeoutMs: 1_000, maxRetries: 1 }
    );

    const results = await runner.executeBatch([
      { callId: 'call-1', toolName: 'flaky_tool', arguments: {} },
    ]);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      {
        callId: 'call-1',
        toolName: 'flaky_tool',
        status: 'success',
        output: JSON.stringify({ ok: true }),
      },
    ]);
  });

  it('returns timeout error when tool exceeds policy timeout', async () => {
    const runner = new ToolRunner(
      {
        slow_tool: async (_args, signal) => {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 100);
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('aborted'));
            });
          });
          return 'late';
        },
      },
      { maxConcurrency: 1, timeoutMs: 10, maxRetries: 0 }
    );

    const results = await runner.executeBatch([
      { callId: 'call-1', toolName: 'slow_tool', arguments: {} },
    ]);

    expect(results).toEqual([
      {
        callId: 'call-1',
        toolName: 'slow_tool',
        status: 'error',
        output: 'Tool "slow_tool" timed out after 10ms.',
      },
    ]);
  });

  it('honors maxConcurrency policy', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const runner = new ToolRunner(
      {
        tracked_tool: async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlight -= 1;
          return 'ok';
        },
      },
      { maxConcurrency: 2, timeoutMs: 1_000, maxRetries: 0 }
    );

    await runner.executeBatch([
      { callId: 'call-1', toolName: 'tracked_tool', arguments: {} },
      { callId: 'call-2', toolName: 'tracked_tool', arguments: {} },
      { callId: 'call-3', toolName: 'tracked_tool', arguments: {} },
    ]);

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('returns empty results when signal is already aborted before batch start', async () => {
    const controller = new AbortController();
    controller.abort();
    const handler = jest.fn();
    const runner = new ToolRunner(
      {
        tracked_tool: handler,
      },
      { maxConcurrency: 2, timeoutMs: 1_000, maxRetries: 0 }
    );

    const results = await runner.executeBatch(
      [{ callId: 'call-1', toolName: 'tracked_tool', arguments: {} }],
      controller.signal
    );

    expect(results).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops scheduling pending calls after signal abort during execution', async () => {
    const controller = new AbortController();
    const handler = jest
      .fn()
      .mockImplementationOnce(async () => {
        controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'first';
      })
      .mockResolvedValue('second');

    const runner = new ToolRunner(
      {
        tracked_tool: handler,
      },
      { maxConcurrency: 1, timeoutMs: 1_000, maxRetries: 0 }
    );

    const results = await runner.executeBatch(
      [
        { callId: 'call-1', toolName: 'tracked_tool', arguments: {} },
        { callId: 'call-2', toolName: 'tracked_tool', arguments: {} },
      ],
      controller.signal
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      {
        callId: 'call-1',
        toolName: 'tracked_tool',
        status: 'success',
        output: 'first',
      },
    ]);
  });
});
