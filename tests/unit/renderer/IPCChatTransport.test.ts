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
       Action: call sendMessages with a user message, then emit MESSAGE_CREATED (llm) + MESSAGE_LLM_TEXT_UPDATED + MESSAGE_UPDATED done=true
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
          done: true,
        },
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED, {
        messageId: 42,
        agentId: 'agent-1',
        delta: 'Hello back!',
        accumulatedText: 'Hello back!',
        timestamp: Date.now(),
      });

      // Emit message updated with completion snapshot
      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 42,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { text: 'Hello back!' } },
          hidden: false,
          done: true,
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
          payload: { data: { error: { message: 'API key invalid' } } },
          hidden: false,
          done: true,
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
       Action: emit MESSAGE_LLM_REASONING_UPDATED events, then MESSAGE_LLM_TEXT_UPDATED and MESSAGE_UPDATED done=true
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
          done: true,
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

      emitEvent(EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED, {
        messageId: 55,
        agentId: 'agent-1',
        delta: 'Done',
        accumulatedText: 'Done',
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 55,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { text: 'Done' } },
          hidden: false,
          done: true,
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

      // reasoning-end must occur before stream finalization
      const reasoningEndIdx = types.indexOf('reasoning-end');
      const finishStepIdx = types.indexOf('finish-step');
      expect(reasoningEndIdx).toBeLessThan(finishStepIdx);
    });

    /* Preconditions: transport created for agent-1
       Action: emit MESSAGE_UPDATED with hidden: true for the llm message
       Assertions: stream closes without emitting text chunks, emits finish after idle delay
       Requirements: llm-integration.3.6, llm-integration.8.5 */
    it('should close stream when llm message becomes hidden', async () => {
      jest.useFakeTimers();
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
          done: true,
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
          done: false,
        },
        timestamp: Date.now(),
      });

      // Advance timers to trigger the 200ms idle finish delay
      jest.advanceTimersByTime(250);

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((c) => c.type);

      expect(types).not.toContain('text-delta');
      // Stream finishes after idle delay to allow potential error messages to arrive
      expect(types).toContain('finish');
      jest.useRealTimers();
    });

    /* Preconditions: transport created for agent-1, llm message becomes hidden, then error message arrives
       Action: emit MESSAGE_CREATED(llm), MESSAGE_UPDATED(hidden:true), then MESSAGE_CREATED(error) within 200ms
       Assertions: stream delivers the error chunk before finishing (idle delay gives error time to arrive)
       Requirements: llm-integration.3.6, llm-integration.11.5.4
       Context: When handleRunError hides an incomplete LLM message and then creates a kind:error
       message, the transport must not close the stream immediately on hidden — the 200ms idle
       delay allows the subsequent error message to be received and enqueued before finish(). */
    it('should deliver error message that arrives after hidden within idle delay window', async () => {
      jest.useFakeTimers();
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      // Step 1: LLM message created (streaming in progress)
      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 200,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: false,
          done: false,
        },
        timestamp: Date.now(),
      });

      // Step 2: LLM message becomes hidden (pipeline detected error, hid incomplete message)
      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 200,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: true,
          done: false,
        },
        timestamp: Date.now(),
      });

      // Step 3: Error message arrives 50ms later (within the 200ms idle window)
      jest.advanceTimersByTime(50);
      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 201,
          agentId: 'agent-1',
          kind: 'error',
          timestamp: Date.now(),
          payload: { data: { error: { message: 'Model response timeout' } } },
          hidden: false,
          done: true,
        },
        timestamp: Date.now(),
      });

      // Advance past the idle delay to ensure stream finishes
      jest.advanceTimersByTime(300);

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((c) => c.type);

      // Error chunk must be present — the idle delay prevented premature stream close
      expect(types).toContain('error');
      expect(types).toContain('finish');

      const errorChunk = chunks.find((c) => c.type === 'error') as {
        type: 'error';
        errorText: string;
      };
      expect(errorChunk?.errorText).toBe('Model response timeout');
      jest.useRealTimers();
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
       Action: emit MESSAGE_CREATED with kind:llm that already has data.text (non-streaming)
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
          payload: { data: { text: 'Already complete response' } },
          hidden: false,
          done: true,
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
          payload: { data: { text: 'Not for us' } },
          hidden: false,
          done: true,
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
          payload: { data: { error: { message: 'done' } } },
          hidden: false,
          done: true,
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

    it('should start stream from MESSAGE_LLM_TEXT_UPDATED even before MESSAGE_CREATED', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED, {
        messageId: 501,
        agentId: 'agent-1',
        delta: 'hello',
        accumulatedText: 'hello',
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 501,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { text: 'hello' } },
          hidden: false,
          done: true,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((c) => c.type);
      expect(types[0]).toBe('start');
      expect(types).toContain('text-delta');
      expect(types).toContain('finish');
    });

    /* Preconditions: one user request produces pre-tool llm segment, tool_call, and post-tool llm segment
       Action: emit events for llm#1(done) -> tool_call(created) -> llm#2(stream+done)
       Assertions: transport keeps one stream and emits two steps without protocol error
       Requirements: llm-integration.11.1.3, llm-integration.11.1.5 */
    it('should support multiple llm segments in one stream when tool_call splits pre and post text', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 1201,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: false,
          done: false,
        },
        timestamp: Date.now(),
      });
      emitEvent(EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED, {
        messageId: 1201,
        agentId: 'agent-1',
        delta: 'pre',
        accumulatedText: 'pre',
        timestamp: Date.now(),
      });
      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 1201,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { text: 'pre' } },
          hidden: false,
          done: true,
        },
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 2201,
          agentId: 'agent-1',
          kind: 'tool_call',
          timestamp: Date.now(),
          payload: { data: { toolName: 'code_exec', output: { status: 'running' } } },
          hidden: false,
          done: false,
        },
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 1202,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: false,
          done: false,
        },
        timestamp: Date.now(),
      });
      emitEvent(EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED, {
        messageId: 1202,
        agentId: 'agent-1',
        delta: 'post',
        accumulatedText: 'post',
        timestamp: Date.now(),
      });
      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 1202,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { text: 'post' } },
          hidden: false,
          done: true,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((chunk) => chunk.type);

      expect(types.filter((type) => type === 'start')).toHaveLength(1);
      expect(types.filter((type) => type === 'start-step').length).toBeGreaterThanOrEqual(2);
      expect(types.filter((type) => type === 'finish-step').length).toBeGreaterThanOrEqual(2);
      expect(types).not.toContain('error');
      expect(types).toContain('finish');
    });

    it('should not emit duplicate start chunks when MESSAGE_CREATED arrives after text stream start', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED, {
        messageId: 901,
        agentId: 'agent-1',
        delta: 'partial',
        accumulatedText: 'partial',
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 901,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: false,
          done: false,
        },
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 901,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { text: 'partial' } },
          hidden: false,
          done: true,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const startChunks = chunks.filter((chunk) => chunk.type === 'start');
      const startStepChunks = chunks.filter((chunk) => chunk.type === 'start-step');
      expect(startChunks).toHaveLength(1);
      expect(startStepChunks).toHaveLength(1);
    });

    it('should start stream from reasoning updates when they arrive before MESSAGE_CREATED', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED, {
        messageId: 920,
        agentId: 'agent-1',
        delta: 'thinking',
        accumulatedText: 'thinking',
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED, {
        messageId: 920,
        agentId: 'agent-1',
        delta: 'answer',
        accumulatedText: 'answer',
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 920,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { text: 'answer' } },
          hidden: false,
          done: true,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((chunk) => chunk.type);
      expect(types[0]).toBe('start');
      expect(types[1]).toBe('start-step');
      expect(types).toContain('reasoning-start');
      expect(types).toContain('reasoning-delta');
      expect(types).toContain('reasoning-end');
      expect(types).toContain('finish');
    });

    it('should use MESSAGE_UPDATED snapshot text when no text stream part exists', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 777,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: false,
          done: false,
        },
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 777,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { text: 'snapshot-only-text' } },
          hidden: false,
          done: true,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const textDelta = chunks.find((chunk) => chunk.type === 'text-delta') as
        | { type: 'text-delta'; delta: string }
        | undefined;
      expect(textDelta?.delta).toBe('snapshot-only-text');
    });

    it('should finalize stream from done MESSAGE_UPDATED snapshot without MESSAGE_CREATED', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 778,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { reasoning: { text: 'r' }, text: 't' } },
          hidden: false,
          done: true,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((chunk) => chunk.type);
      expect(types).toEqual(
        expect.arrayContaining([
          'start',
          'start-step',
          'reasoning-start',
          'reasoning-delta',
          'reasoning-end',
          'text-start',
          'text-delta',
          'text-end',
          'finish-step',
          'finish',
        ])
      );
      const textDelta = chunks.find((chunk) => chunk.type === 'text-delta') as
        | { type: 'text-delta'; delta: string }
        | undefined;
      expect(textDelta?.delta).toBe('t');
    });

    it('should switch step when MESSAGE_LLM_TEXT_UPDATED arrives for a new llm message id', async () => {
      const streamPromise = transport.sendMessages(makeSendOptions());
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 900,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: false,
          done: false,
        },
        timestamp: Date.now(),
      });

      emitEvent(EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED, {
        messageId: 901,
        agentId: 'agent-1',
        delta: 'wrong-id',
        accumulatedText: 'wrong-id',
        timestamp: Date.now(),
      });
      emitEvent(EVENT_TYPES.MESSAGE_UPDATED, {
        message: {
          id: 901,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: { text: 'wrong-id' } },
          hidden: false,
          done: true,
        },
        timestamp: Date.now(),
      });

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      const types = chunks.map((chunk) => chunk.type);
      expect(types).not.toContain('error');
      expect(types.filter((type) => type === 'start-step').length).toBeGreaterThanOrEqual(2);
      expect(types).toContain('text-delta');
      expect(types).toContain('finish');
    });

    it('should close stream when abortSignal fires after start', async () => {
      const controller = new AbortController();
      const streamPromise = transport.sendMessages({
        ...makeSendOptions(),
        abortSignal: controller.signal,
      });
      await Promise.resolve();

      emitEvent(EVENT_TYPES.MESSAGE_CREATED, {
        message: {
          id: 333,
          agentId: 'agent-1',
          kind: 'llm',
          timestamp: Date.now(),
          payload: { data: {} },
          hidden: false,
          done: false,
        },
        timestamp: Date.now(),
      });

      controller.abort();

      const stream = await streamPromise;
      const chunks = await collectChunks(stream);
      expect(chunks.find((chunk) => chunk.type === 'finish')).toBeUndefined();
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
