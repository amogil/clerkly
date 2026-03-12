// Requirements: llm-integration.10, llm-integration.11
// Contract tests for AI SDK ModelMessage[] compatibility.

import { FullHistoryStrategy, PromptBuilder } from '../../../src/main/agents/PromptBuilder';
import type { Message } from '../../../src/main/db/schema';

function makeMessage(overrides: Partial<Message> & { id: number }): Message {
  const { id, ...rest } = overrides;
  return {
    id,
    agentId: 'agent-1',
    kind: 'user',
    timestamp: '2026-03-12T11:00:00.000Z',
    payloadJson: JSON.stringify({ data: { text: 'default' } }),
    usageJson: null,
    replyToMessageId: null,
    hidden: false,
    done: true,
    ...rest,
  };
}

function buildMessages(history: Message[]) {
  const builder = new PromptBuilder('System', [], new FullHistoryStrategy());
  return builder.buildMessages(history);
}

async function safeParseModelMessages(messages: unknown[]): Promise<{ success: boolean }> {
  if (typeof (globalThis as { TransformStream?: unknown }).TransformStream === 'undefined') {
    const webStreams = await import('stream/web');
    (globalThis as { TransformStream?: unknown }).TransformStream = webStreams.TransformStream;
  }
  const { modelMessageSchema } = await import('ai');
  return (modelMessageSchema as { array: () => { safeParse: (v: unknown) => unknown } })
    .array()
    .safeParse(messages) as { success: boolean };
}

async function assertAiSdkModelMessageSchema(messages: unknown[]): Promise<void> {
  const parsed = (await safeParseModelMessages(messages)) as {
    success: boolean;
    error?: { issues?: Array<{ message: string }> };
  };
  if (!parsed.success) {
    const issueText =
      parsed.error?.issues?.map((issue) => issue.message).join('; ') || 'Unknown schema issue';
    throw new Error(`ModelMessage[] schema validation failed: ${issueText}`);
  }
}

function assertLinkedToolReplay(messages: Array<Record<string, unknown>>): void {
  const called = new Set<string>();
  const completed = new Set<string>();

  for (const message of messages) {
    const role = message['role'];
    const content = Array.isArray(message['content']) ? message['content'] : [];

    if (role === 'assistant') {
      for (const part of content) {
        if (
          part &&
          typeof part === 'object' &&
          (part as Record<string, unknown>)['type'] === 'tool-call'
        ) {
          const toolCallId = (part as Record<string, unknown>)['toolCallId'];
          if (typeof toolCallId === 'string') called.add(toolCallId);
        }
      }
    }

    if (role === 'tool') {
      for (const part of content) {
        if (
          part &&
          typeof part === 'object' &&
          (part as Record<string, unknown>)['type'] === 'tool-result'
        ) {
          const toolCallId = (part as Record<string, unknown>)['toolCallId'];
          if (typeof toolCallId === 'string') {
            if (!called.has(toolCallId)) {
              throw new Error(`tool-result has no matching assistant tool-call: ${toolCallId}`);
            }
            completed.add(toolCallId);
          }
        }
      }
    }
  }

  for (const toolCallId of called) {
    if (!completed.has(toolCallId)) {
      throw new Error(`assistant tool-call has no matching tool-result: ${toolCallId}`);
    }
  }
}

describe('Prompt model contract', () => {
  /* Preconditions: Mixed history with user/llm and multiple terminal tool_call records
     Action: Build provider messages through PromptBuilder
     Assertions: Messages satisfy AI SDK ModelMessage[] schema and linked replay pair invariants
     Requirements: llm-integration.10.1, llm-integration.11.3.1.3 */
  it('should build schema-valid and linked replay messages for mixed history', async () => {
    const history = [
      makeMessage({ id: 1, kind: 'user', payloadJson: JSON.stringify({ data: { text: 'q1' } }) }),
      makeMessage({ id: 2, kind: 'llm', payloadJson: JSON.stringify({ data: { text: 'a1' } }) }),
      makeMessage({
        id: 3,
        kind: 'tool_call',
        payloadJson: JSON.stringify({
          data: {
            callId: 'call-1',
            toolName: 'code_exec',
            arguments: { code: '1+1' },
            output: { status: 'success', stdout: '2' },
          },
        }),
      }),
      makeMessage({
        id: 4,
        kind: 'tool_call',
        payloadJson: JSON.stringify({
          data: {
            callId: 'call-2',
            toolName: 'search_docs',
            arguments: { query: 'retry' },
            output: { status: 'error', message: 'boom' },
          },
        }),
      }),
      makeMessage({ id: 5, kind: 'user', payloadJson: JSON.stringify({ data: { text: 'q2' } }) }),
    ];

    const messages = buildMessages(history);
    await assertAiSdkModelMessageSchema(messages);
    assertLinkedToolReplay(messages as unknown as Array<Record<string, unknown>>);
  });

  /* Preconditions: Terminal tool_call outputs with each allowed status
     Action: Build provider messages
     Assertions: tool-result uses ToolResultOutput envelope and preserves terminal status
     Requirements: llm-integration.11.3.1.1, llm-integration.11.3.1.3.2 */
  it.each(['success', 'error', 'timeout', 'cancelled'])(
    'should encode status %s in tool-result output envelope',
    async (status) => {
      const messages = buildMessages([
        makeMessage({
          id: 1,
          kind: 'tool_call',
          payloadJson: JSON.stringify({
            data: {
              callId: `call-${status}`,
              toolName: 'code_exec',
              arguments: { code: 'x' },
              output: { status, stdout: '', stderr: '' },
            },
          }),
        }),
      ]);

      expect(messages[2]).toMatchObject({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: `call-${status}`,
            toolName: 'code_exec',
            output: {
              type: 'json',
              value: {
                status,
              },
            },
          },
        ],
      });
      await assertAiSdkModelMessageSchema(messages);
    }
  );

  /* Preconditions: Legacy tool-result payload with "result" field
     Action: Validate against AI SDK ModelMessage[] schema
     Assertions: Schema validation fails
     Requirements: llm-integration.11.3.1.3 */
  it('should fail schema validation for legacy tool-result.result payload', async () => {
    const legacyMessages = [
      { role: 'system', content: 'System' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-legacy',
            toolName: 'code_exec',
            input: { code: 'x' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-legacy',
            toolName: 'code_exec',
            result: { status: 'success' },
          },
        ],
      },
    ];

    const parsed = await safeParseModelMessages(legacyMessages);
    expect(parsed.success).toBe(false);
  });

  /* Preconditions: tool-result appears without corresponding assistant tool-call
     Action: Run linked replay invariant check
     Assertions: Invariant fails
     Requirements: llm-integration.11.3.1.3 */
  it('should fail linked replay invariant when tool-result has no matching tool-call', () => {
    const orphanResult = [
      { role: 'system', content: 'System' },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-orphan',
            toolName: 'code_exec',
            output: { type: 'json', value: { status: 'success' } },
          },
        ],
      },
    ];

    expect(() =>
      assertLinkedToolReplay(orphanResult as unknown as Array<Record<string, unknown>>)
    ).toThrow('tool-result has no matching assistant tool-call');
  });

  /* Preconditions: assistant tool-call id differs from tool-result id
     Action: Run linked replay invariant check
     Assertions: Invariant fails
     Requirements: llm-integration.11.3.1.3 */
  it('should fail linked replay invariant when toolCallId is mismatched', () => {
    const mismatchedIds = [
      { role: 'system', content: 'System' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-a',
            toolName: 'code_exec',
            input: { code: 'x' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-b',
            toolName: 'code_exec',
            output: { type: 'json', value: { status: 'success' } },
          },
        ],
      },
    ];

    expect(() =>
      assertLinkedToolReplay(mismatchedIds as unknown as Array<Record<string, unknown>>)
    ).toThrow('tool-result has no matching assistant tool-call');
  });

  /* Preconditions: Long mixed history includes hidden, malformed and non-terminal tool_call rows
     Action: Build provider messages
     Assertions: Invalid/incomplete records are skipped and resulting messages remain schema-valid
     Requirements: llm-integration.10.3, llm-integration.11.3.1.2 */
  it('should skip malformed and non-terminal tool_call records and keep valid message schema', async () => {
    const history = [
      makeMessage({ id: 1, kind: 'user', payloadJson: JSON.stringify({ data: { text: 'q1' } }) }),
      makeMessage({ id: 2, kind: 'llm', payloadJson: JSON.stringify({ data: { text: 'a1' } }) }),
      makeMessage({ id: 3, kind: 'tool_call', payloadJson: 'not-json' }),
      makeMessage({
        id: 4,
        kind: 'tool_call',
        payloadJson: JSON.stringify({
          data: { toolName: 'code_exec', arguments: { code: 'x' }, output: { status: 'success' } },
        }),
      }),
      makeMessage({
        id: 5,
        kind: 'tool_call',
        payloadJson: JSON.stringify({
          data: {
            callId: 'call-running',
            toolName: 'code_exec',
            arguments: { code: 'x' },
            output: { status: 'running' },
          },
        }),
      }),
      makeMessage({
        id: 6,
        kind: 'tool_call',
        payloadJson: JSON.stringify({
          data: {
            callId: 'call-ok',
            toolName: 'code_exec',
            arguments: { code: 'console.log(1)' },
            output: { status: 'success', stdout: '1' },
          },
        }),
      }),
      makeMessage({
        id: 7,
        kind: 'llm',
        hidden: true,
        payloadJson: JSON.stringify({ data: { text: 'hidden' } }),
      }),
    ];

    const messages = buildMessages(history);
    await assertAiSdkModelMessageSchema(messages);
    assertLinkedToolReplay(messages as unknown as Array<Record<string, unknown>>);
    expect(JSON.stringify(messages)).toContain('call-ok');
    expect(JSON.stringify(messages)).not.toContain('call-running');
  });
});
