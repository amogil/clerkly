// Requirements: agents.4, agents.7, agents.13, llm-integration.3, llm-integration.3.8, llm-integration.8.5

import { toUIMessage, toUIMessages } from '../../../src/renderer/lib/messageMapper';
import type { MessageSnapshot } from '../../../src/shared/events/types';

function makeSnapshot(overrides: Partial<MessageSnapshot> & { kind: string }): MessageSnapshot {
  return {
    id: 1,
    agentId: 'agent-1',
    timestamp: Date.now(),
    payload: { data: {} },
    replyToMessageId: null,
    hidden: false,
    done: true,
    ...overrides,
  };
}

describe('toUIMessage', () => {
  // ─── hidden messages ────────────────────────────────────────────────────

  /* Preconditions: message with hidden: true
     Action: call toUIMessage
     Assertions: returns null
     Requirements: llm-integration.3.8, llm-integration.8.5 */
  it('should return null for hidden messages', () => {
    const msg = makeSnapshot({ kind: 'user', hidden: true, payload: { data: { text: 'hi' } } });
    expect(toUIMessage(msg)).toBeNull();
  });

  // ─── user messages ───────────────────────────────────────────────────────

  /* Preconditions: kind: 'user' message with text
     Action: call toUIMessage
     Assertions: returns UIMessage with role: 'user' and text part
     Requirements: agents.7.3 */
  it('should map user message to role: user with text part', () => {
    const msg = makeSnapshot({ kind: 'user', payload: { data: { text: 'Hello agent' } } });
    const result = toUIMessage(msg);

    expect(result).not.toBeNull();
    expect(result!.role).toBe('user');
    expect(result!.id).toBe('1');
    expect(result!.parts).toHaveLength(1);
    expect(result!.parts[0]).toEqual({ type: 'text', text: 'Hello agent' });
  });

  /* Preconditions: kind: 'user' message with empty text
     Action: call toUIMessage
     Assertions: returns UIMessage with empty text part
     Requirements: agents.7.3 */
  it('should handle user message with empty text', () => {
    const msg = makeSnapshot({ kind: 'user', payload: { data: { text: '' } } });
    const result = toUIMessage(msg);

    expect(result).not.toBeNull();
    expect(result!.parts[0]).toEqual({ type: 'text', text: '' });
  });

  // ─── llm messages ────────────────────────────────────────────────────────

  /* Preconditions: kind: 'llm' message with data.text
     Action: call toUIMessage
     Assertions: returns UIMessage with role: 'assistant' and text part
     Requirements: agents.7.3 */
  it('should map llm message with data.text to role: assistant with text part', () => {
    const msg = makeSnapshot({
      kind: 'llm',
      payload: { data: { text: 'Here is my response' } },
    });
    const result = toUIMessage(msg);

    expect(result).not.toBeNull();
    expect(result!.role).toBe('assistant');
    const textPart = result!.parts.find((p) => p.type === 'text');
    expect(textPart).toEqual({ type: 'text', text: 'Here is my response', state: 'done' });
  });

  /* Preconditions: kind: 'llm' message with reasoning and data.text
     Action: call toUIMessage
     Assertions: returns UIMessage with reasoning part before text part
     Requirements: llm-integration.7 */
  it('should include reasoning part before text part for llm message', () => {
    const msg = makeSnapshot({
      kind: 'llm',
      payload: {
        data: {
          reasoning: { text: 'Let me think...' },
          text: 'Answer',
        },
      },
    });
    const result = toUIMessage(msg);

    expect(result).not.toBeNull();
    expect(result!.parts).toHaveLength(2);
    expect(result!.parts[0]).toEqual({ type: 'reasoning', text: 'Let me think...', state: 'done' });
    expect(result!.parts[1]).toEqual({ type: 'text', text: 'Answer', state: 'done' });
  });

  /* Preconditions: kind: 'llm' message without data.text (streaming in progress)
     Action: call toUIMessage
     Assertions: returns UIMessage with empty parts array
     Requirements: agents.4.13 */
  it('should return empty parts for llm message without data.text (streaming)', () => {
    const msg = makeSnapshot({ kind: 'llm', payload: { data: {} } });
    const result = toUIMessage(msg);

    expect(result).not.toBeNull();
    expect(result!.role).toBe('assistant');
    expect(result!.parts).toHaveLength(0);
  });

  // ─── error messages ──────────────────────────────────────────────────────

  /* Preconditions: kind: 'error' message with message text
     Action: call toUIMessage
     Assertions: returns UIMessage with role: 'assistant', text part, and isError metadata
     Requirements: llm-integration.3.4 */
  it('should map error message with isError metadata', () => {
    const msg = makeSnapshot({
      kind: 'error',
      payload: { data: { error: { message: 'API key invalid' } } },
    });
    const result = toUIMessage(msg);

    expect(result).not.toBeNull();
    expect(result!.role).toBe('assistant');
    expect(result!.parts[0]).toEqual({ type: 'text', text: 'API key invalid' });
    expect((result!.metadata as Record<string, unknown>)?.isError).toBe(true);
    expect((result!.metadata as Record<string, unknown>)?.errorMessage).toBe('API key invalid');
  });

  /* Preconditions: kind: 'error' message with action_link
     Action: call toUIMessage
     Assertions: metadata includes actionLink
     Requirements: llm-integration.3.4.1 */
  it('should include actionLink in error message metadata', () => {
    const msg = makeSnapshot({
      kind: 'error',
      payload: {
        data: {
          error: {
            message: 'Settings required',
            action_link: { label: 'Open Settings', screen: 'settings' },
          },
        },
      },
    });
    const result = toUIMessage(msg);

    expect(result).not.toBeNull();
    const meta = result!.metadata as Record<string, unknown>;
    expect(meta.actionLink).toEqual({ label: 'Open Settings', screen: 'settings' });
  });

  /* Preconditions: kind: 'error' message without message field
     Action: call toUIMessage
     Assertions: uses fallback error text
     Requirements: llm-integration.3.4 */
  it('should use fallback text for error message without message field', () => {
    const msg = makeSnapshot({ kind: 'error', payload: { data: {} } });
    const result = toUIMessage(msg);

    expect(result).not.toBeNull();
    expect(result!.parts[0]).toEqual({ type: 'text', text: 'An error occurred' });
  });

  // ─── unknown kinds ───────────────────────────────────────────────────────

  /* Preconditions: message with kind 'tool_call' and done=false
     Action: call toUIMessage
     Assertions: returns assistant message with dynamic-tool input-available part
     Requirements: llm-integration.11.3 */
  it('should map in-progress tool_call to dynamic-tool input-available part', () => {
    const msg = makeSnapshot({
      kind: 'tool_call',
      done: false,
      payload: {
        data: {
          callId: 'call-1',
          toolName: 'search_docs',
          arguments: { query: 'streaming' },
        },
      },
    });
    const result = toUIMessage(msg);
    expect(result).not.toBeNull();
    expect(result!.role).toBe('assistant');
    expect(result!.parts[0]).toEqual({
      type: 'dynamic-tool',
      toolName: 'search_docs',
      toolCallId: 'call-1',
      state: 'input-available',
      input: { query: 'streaming' },
    });
    const meta = result!.metadata as Record<string, unknown>;
    expect(meta.isToolCall).toBe(true);
    expect(meta.toolName).toBe('search_docs');
  });

  /* Preconditions: message with kind 'tool_call', done=true, success output
     Action: call toUIMessage
     Assertions: returns dynamic-tool output-available part
     Requirements: llm-integration.11.3 */
  it('should map completed successful tool_call to dynamic-tool output-available part', () => {
    const msg = makeSnapshot({
      kind: 'tool_call',
      done: true,
      payload: {
        data: {
          callId: 'call-1',
          toolName: 'search_docs',
          arguments: { query: 'streaming' },
          output: { status: 'success', content: 'result' },
        },
      },
    });
    const result = toUIMessage(msg);
    expect(result).not.toBeNull();
    expect(result!.role).toBe('assistant');
    expect(result!.parts[0]).toEqual({
      type: 'dynamic-tool',
      toolName: 'search_docs',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { query: 'streaming' },
      output: { status: 'success', content: 'result' },
    });
  });

  /* Preconditions: message with kind 'tool_call', done=true, error output
     Action: call toUIMessage
     Assertions: returns dynamic-tool output-error part
     Requirements: llm-integration.11.3 */
  it('should map failed tool_call to dynamic-tool output-error part', () => {
    const msg = makeSnapshot({
      kind: 'tool_call',
      done: true,
      payload: {
        data: {
          callId: 'call-1',
          toolName: 'search_docs',
          arguments: { query: 'streaming' },
          output: { status: 'error', content: 'tool failed' },
        },
      },
    });
    const result = toUIMessage(msg);
    expect(result).not.toBeNull();
    expect(result!.role).toBe('assistant');
    expect(result!.parts[0]).toEqual({
      type: 'dynamic-tool',
      toolName: 'search_docs',
      toolCallId: 'call-1',
      state: 'output-error',
      input: { query: 'streaming' },
      errorText: 'tool failed',
    });
  });

  /* Preconditions: message with kind 'tool_call' for final_answer
     Action: call toUIMessage
     Assertions: maps to assistant metadata message without synthetic text
     Requirements: llm-integration.9.7, agents.7.4.1 */
  it('should map final_answer tool_call to assistant text part', () => {
    const msg = makeSnapshot({
      kind: 'tool_call',
      done: true,
      payload: {
        data: {
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: {
            summary_points: ['Point 1'],
          },
        },
      },
    });
    const result = toUIMessage(msg);
    expect(result).not.toBeNull();
    expect(result!.role).toBe('assistant');
    expect(result!.parts).toEqual([]);
    expect((result!.metadata as Record<string, unknown>).isFinalAnswer).toBe(true);
    expect((result!.metadata as Record<string, unknown>).summary_points).toEqual(['Point 1']);
  });

  /* Preconditions: final_answer without arguments
     Action: call toUIMessage
     Assertions: keeps empty parts and normalizes summary_points to empty array
     Requirements: llm-integration.9.6 */
  it('should map final_answer without arguments to empty parts and empty summary points', () => {
    const msg = makeSnapshot({
      kind: 'tool_call',
      done: true,
      payload: {
        data: {
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: {},
        },
      },
    });
    const result = toUIMessage(msg);
    expect(result).not.toBeNull();
    expect(result!.role).toBe('assistant');
    expect(result!.parts).toEqual([]);
    expect((result!.metadata as Record<string, unknown>).summary_points).toEqual([]);
  });

  /* Preconditions: final_answer without summary_points field
     Action: call toUIMessage
     Assertions: summary_points normalized to empty array
     Requirements: llm-integration.9.5.1.2 */
  it('should normalize final_answer summaryPoints to empty array when missing', () => {
    const msg = makeSnapshot({
      kind: 'tool_call',
      done: true,
      payload: {
        data: {
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: {},
        },
      },
    });
    const result = toUIMessage(msg);
    expect(result).not.toBeNull();
    expect((result!.metadata as Record<string, unknown>).summary_points).toEqual([]);
  });

  /* Preconditions: final_answer with non-array summary_points value
     Action: call toUIMessage
     Assertions: summary_points normalized to empty array
     Requirements: llm-integration.9.5.1 */
  it('should normalize non-array final_answer summary_points to empty array', () => {
    const msg = makeSnapshot({
      kind: 'tool_call',
      done: true,
      payload: {
        data: {
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: { summary_points: 'not-array' as unknown as string[] },
        },
      },
    });
    const result = toUIMessage(msg);
    expect(result).not.toBeNull();
    expect((result!.metadata as Record<string, unknown>).summary_points).toEqual([]);
  });
});

describe('toUIMessages', () => {
  /* Preconditions: array of mixed messages including hidden
     Action: call toUIMessages
     Assertions: result contains only visible mapped messages
     Requirements: agents.4.8, agents.13.1 */
  it('should filter out hidden messages', () => {
    const msgs: MessageSnapshot[] = [
      makeSnapshot({ id: 1, kind: 'user', payload: { data: { text: 'hi' } } }),
      makeSnapshot({ id: 2, kind: 'user', hidden: true, payload: { data: { text: 'hidden' } } }),
      makeSnapshot({ id: 3, kind: 'tool_call' }),
      makeSnapshot({ id: 4, kind: 'llm', payload: { data: { text: 'response' } } }),
    ];

    const result = toUIMessages(msgs);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('3');
    expect(result[2].id).toBe('4');
  });

  /* Preconditions: empty array
     Action: call toUIMessages
     Assertions: returns empty array
     Requirements: agents.13.1 */
  it('should return empty array for empty input', () => {
    expect(toUIMessages([])).toEqual([]);
  });

  /* Preconditions: array of messages
     Action: call toUIMessages
     Assertions: count of UIMessages <= count of MessageSnapshots (invariant)
     Requirements: agents.13 */
  it('should never return more UIMessages than input snapshots', () => {
    const msgs: MessageSnapshot[] = [
      makeSnapshot({ id: 1, kind: 'user', payload: { data: { text: 'a' } } }),
      makeSnapshot({ id: 2, kind: 'llm', payload: { data: {} } }),
      makeSnapshot({ id: 3, kind: 'error', payload: { data: { error: { message: 'err' } } } }),
    ];
    const result = toUIMessages(msgs);
    expect(result.length).toBeLessThanOrEqual(msgs.length);
  });

  /* Preconditions: user messages in array
     Action: call toUIMessages
     Assertions: all user messages have role: 'user'
     Requirements: agents.7.3 */
  it('should always map user kind to role: user', () => {
    const msgs: MessageSnapshot[] = [
      makeSnapshot({ id: 1, kind: 'user', payload: { data: { text: 'a' } } }),
      makeSnapshot({ id: 2, kind: 'user', payload: { data: { text: 'b' } } }),
    ];
    const result = toUIMessages(msgs);
    expect(result.every((m) => m.role === 'user')).toBe(true);
  });
});
