/**
 * @jest-environment jsdom
 */
// Requirements: agents.4, agents.12, llm-integration.2, llm-integration.3, llm-integration.7, llm-integration.8

// Polyfill ReadableStream for jsdom environment
import { ReadableStream as NodeReadableStream } from 'stream/web';
if (typeof globalThis.ReadableStream === 'undefined') {
  (globalThis as unknown as { ReadableStream: typeof NodeReadableStream }).ReadableStream =
    NodeReadableStream;
}

import { IPCChatTransport } from '../../../src/renderer/lib/IPCChatTransport';
import { RendererEventBus } from '../../../src/renderer/events/RendererEventBus';
import { EVENT_TYPES } from '../../../src/shared/events/constants';
import type { UIMessage, UIMessageChunk } from 'ai';

// Mock RendererEventBus
jest.mock('../../../src/renderer/events/RendererEventBus');

// Mock window.api
const mockCreate = jest.fn();
(window as unknown as { api: unknown }).api = {
  messages: {
    create: mockCreate,
  },
  events: {
    onEvent: jest.fn(() => jest.fn()),
    sendEvent: jest.fn(),
  },
};

/** Helper: collect all chunks from a ReadableStream */
async function collectChunks(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

/** Helper: build a minimal UIMessage */
function userMessage(text: string): UIMessage {
  return {
    id: 'msg-1',
    role: 'user',
    parts: [{ type: 'text', text }],
  };
}

describe('IPCChatTransport', () => {
  let transport: IPCChatTransport;
  let mockEventBus: jest.Mocked<RendererEventBus>;
  // Map of event type → handler
  const handlers: Map<string, (payload: unknown) => void> = new Map();

  beforeEach(() => {
    jest.clearAllMocks();
    handlers.clear();

    // Setup mock EventBus
    mockEventBus = {
      subscribe: jest.fn((eventType: string, handler: (payload: unknown) => void) => {
        handlers.set(eventType, handler);
        return () => handlers.delete(eventType);
      }),
      publish: jest.fn(),
      subscribeAll: jest.fn(),
    } as unknown as jest.Mocked<RendererEventBus>;

    (RendererEventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    transport = new IPCChatTransport('agent-1');
    mockCreate.mockResolvedValue({ success: true });
  });

  function emitEvent(eventType: string, payload: unknown) {
    const handler = handlers.get(eventType);
    if (handler) handler(payload);
  }

  function makeSendOptions(text = 'hello') {
    return {
      trigger: 'submit-message' as const,
      chatId: 'agent-1',
      messageId: undefined,
      messages: [userMessage(text)],
      abortSignal: undefined,
    };
  }

  // ─── sendMessages ────────────────────────────────────────────────────────

  describe('sendMessages', () => {
    /* Preconditions: transport created for agent-1, window.api.messages.create resolves success
       Action: call sendMessages with a user message, then emit MESSAGE_CREATED (llm) + MESSAGE_UPDATED with action
       Assertions: stream emits start, start-step, reasoning-end (if any), text-start, text-delta, text-end, finish-step, finish
       Requirements: agents.4.3, llm-integration.2 */
    it('should emit correct chunks for a normal llm response', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions('hello'));

      // Wait for IPC call to be made
      await Promise.resolve();

      // Emit llm message created (no action yet — streaming)
      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 42,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: false,
        },
        timestamp: Date.now(),
      });

      // Emit message updated with action content
      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 42,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { action: { content: 'Hello back!' } } },
          hidden: false,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);

      const types = chunks.map((c) => c.type);
      expect(types).toContain('start');
      expect(types).toContain('start-step');
      expect(types).toContain('text-start');
      expect(types).toContain('text-delta');
      expect(types).toContain('text-end');
      expect(types).toContain('finish-step');
      expect(types).toContain('finish');

      const textDelta = chunks.find((c) => c.type === 'text-delta') as {
        type: 'text-delta';
        delta: string;
        id: string;
      };
      expect(textDelta?.delta).toBe('Hello back!');
    });

    /* Preconditions: transport created for agent-1
       Action: emit MESSAGE_CREATED with kind: error
       Assertions: stream emits start + error chunk with errorText + finish
       Requirements: llm-integration.3.4 */
    it('should emit error chunk for kind:error message', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 99,
          agentId: 'agent-1',
          kind: 'error',
          timestamp: Date.now(),
          payload: { data: { message: 'API key invalid' } },
          hidden: false,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);

      const types = chunks.map((c) => c.type);
      expect(types).toContain('start');
      expect(types).toContain('error');
      expect(types).toContain('finish');

      const errorChunk = chunks.find((c) => c.type === 'error') as {
        type: 'error';
        errorText: string;
      };
      expect(errorChunk?.errorText).toBe('API key invalid');
    });

    /* Preconditions: transport created for agent-1
       Action: emit MESSAGE_LLM_REASONING_UPDATED events, then MESSAGE_UPDATED with action
       Assertions: stream emits reasoning-start, reasoning-delta, reasoning-end before text chunks
       Requirements: llm-integration.7 */
    it('should emit reasoning chunks during streaming', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 55,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: false,
        },
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED, {
        messageId: 55,
        agentId: 'agent-1',
        delta: 'thinking...',
        accumulatedText: 'thinking...',
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 55,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { action: { content: 'Done' } } },
          hidden: false,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((c) => c.type);

      expect(types).toContain('reasoning-start');
      expect(types).toContain('reasoning-delta');
      expect(types).toContain('reasoning-end');

      const reasoningDelta = chunks.find((c) => c.type === 'reasoning-delta') as {
        type: 'reasoning-delta';
        delta: string;
        id: string;
      };
      expect(reasoningDelta?.delta).toBe('thinking...');

      // reasoning-end must come before text-start
      const reasoningEndIdx = types.indexOf('reasoning-end');
      const textStartIdx = types.indexOf('text-start');
      expect(reasoningEndIdx).toBeLessThan(textStartIdx);
    });

    /* Preconditions: transport created for agent-1
       Action: emit MESSAGE_UPDATED with hidden: true for the llm message
       Assertions: stream closes without emitting text chunks
       Requirements: llm-integration.8.5 */
    it('should close stream when llm message becomes hidden', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 77,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: false,
        },
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 77,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: true,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((c) => c.type);

      expect(types).not.toContain('text-delta');
      expect(types).not.toContain('finish');
    });

    /* Preconditions: transport created for agent-1, abortSignal already aborted
       Action: call sendMessages with aborted signal
       Assertions: stream closes immediately without calling window.api.messages.create
       Requirements: llm-integration.8 */
    it('should close stream immediately if abortSignal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const stream = await transport.sendMessages({
        ...makeSendOptions(),
        abortSignal: controller.signal,
      });

      const chunks = await collectChunks(stream);
      expect(chunks).toHaveLength(0);
    });

    /* Preconditions: transport created for agent-1, window.api.messages.create returns success:false
       Action: call sendMessages, IPC create returns failure result
       Assertions: stream emits error chunk + finish
       Requirements: agents.4.3 */
    it('should emit error chunk when IPC create returns success:false', async () => {
      mockCreate.mockResolvedValue({ success: false, error: 'Agent not found' });

      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();
      await Promise.resolve(); // allow .then to run

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((c) => c.type);

      expect(types).toContain('error');
      expect(types).toContain('finish');
      const errorChunk = chunks.find((c) => c.type === 'error') as {
        type: 'error';
        errorText: string;
      };
      expect(errorChunk?.errorText).toBe('Agent not found');
    });

    /* Preconditions: transport created for agent-1
       Action: emit MESSAGE_CREATED with kind:llm that already has action.content (non-streaming)
       Assertions: stream emits start, start-step, text-start, text-delta, text-end, finish-step, finish immediately
       Requirements: llm-integration.2 */
    it('should emit complete text chunks when llm message arrives already complete', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 88,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { action: { content: 'Already complete response' } } },
          hidden: false,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((c) => c.type);

      expect(types).toContain('start');
      expect(types).toContain('start-step');
      expect(types).toContain('text-start');
      expect(types).toContain('text-delta');
      expect(types).toContain('text-end');
      expect(types).toContain('finish-step');
      expect(types).toContain('finish');

      const textDelta = chunks.find((c) => c.type === 'text-delta') as {
        type: 'text-delta';
        delta: string;
        id: string;
      };
      expect(textDelta?.delta).toBe('Already complete response');
    });

    /* Preconditions: transport created for agent-1, window.api.messages.create returns success:false without error message
       Action: call sendMessages, IPC create returns failure result with no error field
       Assertions: stream emits error chunk with fallback message + finish
       Requirements: agents.4.3 */
    it('should use fallback error message when IPC create returns success:false without error', async () => {
      mockCreate.mockResolvedValue({ success: false });

      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();
      await Promise.resolve();

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const errorChunk = chunks.find((c) => c.type === 'error') as {
        type: 'error';
        errorText: string;
      };
      expect(errorChunk?.errorText).toBe('Failed to send message');
    });

    /* Preconditions: transport created for agent-1, window.api.messages.create rejects
       Action: call sendMessages, IPC create fails
       Assertions: stream emits error chunk + finish
       Requirements: agents.4.3 */
    it('should emit error chunk when IPC create fails', async () => {
      mockCreate.mockRejectedValue(new Error('IPC error'));

      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();
      await Promise.resolve(); // allow rejection to propagate

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((c) => c.type);

      expect(types).toContain('error');
      expect(types).toContain('finish');
    });

    /* Preconditions: transport created for agent-1
       Action: emit MESSAGE_CREATED from a different agent
       Assertions: stream does not react to events from other agents
       Requirements: agents.12.7 */
    it('should ignore events from other agents', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      // Event from different agent
      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 10,
          agentId: 'other-agent',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { action: { content: 'Not for us' } } },
          hidden: false,
        },
        timestamp: Date.now(),
      });

      // Now emit for correct agent to close stream
      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 11,
          agentId: 'agent-1',
          kind: 'error',
          timestamp: Date.now(),
          payload: { data: { message: 'done' } },
          hidden: false,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);

      // Should only have chunks from agent-1's error message
      const startChunks = chunks.filter((c) => c.type === 'start');
      expect(startChunks).toHaveLength(1);
    });

    /* Preconditions: transport created for agent-1
       Action: call sendMessages, extract last user message text
       Assertions: window.api.messages.create called with correct agentId and text
       Requirements: agents.4.3 */
    it('should call window.api.messages.create with correct agentId and text', async () => {
      transport.sendMessages(makeSendOptions('test message'));
      await Promise.resolve();

      expect(mockCreate).toHaveBeenCalledWith('agent-1', 'user', {
        data: { text: 'test message' },
      });
    });
  });

  // ─── reconnectToStream ───────────────────────────────────────────────────

  describe('reconnectToStream', () => {
    /* Preconditions: transport created
       Action: call reconnectToStream
       Assertions: returns null (no server-side reconnect)
       Requirements: llm-integration.8 */
    it('should return null (no server-side reconnect)', async () => {
      const result = await transport.reconnectToStream({ chatId: 'agent-1' });
      expect(result).toBeNull();
    });
  });
});
