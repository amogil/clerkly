// Requirements: agents.4, agents.7, agents.13, llm-integration.3, llm-integration.3.8, llm-integration.8.5

import type { UIMessage } from 'ai';
import type { MessageSnapshot } from '../../shared/events/types';

/**
 * Convert a single MessageSnapshot to UIMessage for AI SDK useChat.
 * Returns null for hidden messages (hidden errors, cancelled llm).
 *
 * Mapping rules:
 * - kind: 'user'  → role: 'user',      parts: [{ type: 'text', text }]
 * - kind: 'llm'   → role: 'assistant', parts: [reasoning?, text?]
 * - kind: 'error' → role: 'assistant', parts: [{ type: 'text', text: errorMessage }], metadata: { isError, ... }
 * - kind: 'tool_call' → role: 'assistant', parts: [dynamic-tool part], metadata: { isToolCall, ... }
 * - hidden: true  → null (filtered out)
 *
 * Requirements: agents.7.3, llm-integration.3.4, llm-integration.3.8, llm-integration.8.5
 */
export function toUIMessage(msg: MessageSnapshot): UIMessage | null {
  // Filter hidden messages (hidden errors, cancelled llm)
  if (msg.hidden) return null;

  const data = (msg.payload.data ?? {}) as Record<string, unknown>;

  if (msg.kind === 'user') {
    const text = (data.text as string | undefined) ?? '';
    return {
      id: String(msg.id),
      role: 'user',
      parts: [{ type: 'text', text }],
    };
  }

  if (msg.kind === 'llm') {
    const parts: UIMessage['parts'] = [];

    // Reasoning part (if present)
    const reasoning = data.reasoning as { text?: string } | undefined;
    if (reasoning?.text) {
      parts.push({ type: 'reasoning', text: reasoning.text, state: 'done' });
    }

    // Text part from canonical data.text
    const text = typeof data.text === 'string' ? data.text : undefined;
    if (text && text.length > 0) {
      parts.push({ type: 'text', text, state: 'done' });
    }

    return {
      id: String(msg.id),
      role: 'assistant',
      parts,
    };
  }

  if (msg.kind === 'error') {
    const error = data.error as
      | { message?: string; action_link?: { label: string; screen: string } }
      | undefined;
    const errorMessage = error?.message ?? 'An error occurred';
    const actionLink = error?.action_link;

    return {
      id: String(msg.id),
      role: 'assistant',
      parts: [{ type: 'text', text: errorMessage }],
      metadata: {
        isError: true,
        errorMessage,
        actionLink,
      },
    };
  }

  if (msg.kind === 'tool_call') {
    const call = data as {
      toolName?: string;
      callId?: string;
      arguments?: Record<string, unknown>;
      output?: { status?: string; content?: string };
    };
    const toolName = call.toolName ?? 'tool';
    const callId = call.callId ?? String(msg.id);
    const input = call.arguments ?? {};

    const toolPart: UIMessage['parts'][number] = msg.done
      ? call.output?.status === 'error'
        ? {
            type: 'dynamic-tool',
            toolName,
            toolCallId: callId,
            state: 'output-error',
            input,
            errorText:
              typeof call.output?.content === 'string' && call.output.content.length > 0
                ? call.output.content
                : 'Tool execution failed',
          }
        : {
            type: 'dynamic-tool',
            toolName,
            toolCallId: callId,
            state: 'output-available',
            input,
            output: call.output ?? {},
          }
      : {
          type: 'dynamic-tool',
          toolName,
          toolCallId: callId,
          state: 'input-available',
          input,
        };

    return {
      id: String(msg.id),
      role: 'assistant',
      parts: [toolPart],
      metadata: {
        isToolCall: true,
        toolName,
        callId,
      },
    };
  }

  // Unknown kinds — skip
  return null;
}

/**
 * Convert an array of MessageSnapshots to UIMessages, filtering out hidden/unknown.
 * Requirements: agents.4.8, agents.13.1
 */
export function toUIMessages(messages: MessageSnapshot[]): UIMessage[] {
  const result: UIMessage[] = [];
  for (const msg of messages) {
    const uiMsg = toUIMessage(msg);
    if (uiMsg !== null) result.push(uiMsg);
  }
  return result;
}
