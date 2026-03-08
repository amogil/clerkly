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
});
