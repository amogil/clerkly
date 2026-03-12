// Requirements: agents.4, agents.12, agents.13, llm-integration.2, llm-integration.3, llm-integration.7, llm-integration.8

import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { RendererEventBus } from '../events/RendererEventBus';
import { EVENT_TYPES } from '../../shared/events/constants';
import type {
  MessageCreatedPayload,
  MessageUpdatedPayload,
  MessageLlmReasoningUpdatedPayload,
  MessageLlmTextUpdatedPayload,
} from '../../shared/events/types';

/**
 * IPC-based ChatTransport for AI SDK useChat hook.
 * Bridges useChat with Electron IPC instead of HTTP.
 *
 * Flow:
 * 1. sendMessages() extracts the last user message and calls window.api.messages.create()
 * 2. Subscribes to IPC events (MESSAGE_CREATED, MESSAGE_UPDATED, MESSAGE_LLM_REASONING_UPDATED, MESSAGE_LLM_TEXT_UPDATED)
 * 3. Converts IPC events into UIMessageChunk stream for useChat
 * 4. Closes stream on finish or abort
 */
export class IPCChatTransport implements ChatTransport<UIMessage> {
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  // Requirements: agents.4.3, llm-integration.2, llm-integration.8
  async sendMessages(
    options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal } = options;

    // Extract the last user message to send
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const text =
      lastUserMessage?.parts
        ?.filter((p) => p.type === 'text')
        .map((p) => (p as { type: 'text'; text: string }).text)
        .join('') ?? '';

    const agentId = this.agentId;
    const eventBus = RendererEventBus.getInstance();

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        // If already aborted before we even start, close immediately
        if (abortSignal?.aborted) {
          controller.close();
          return;
        }

        let finished = false;
        let activeLlmMessageId: number | null = null;
        let streamMessageId: string | null = null;
        let stepOpen = false;
        let reasoningId: string | null = null;
        let textPartId: string | null = null;
        let finishTimer: ReturnType<typeof setTimeout> | null = null;
        const unsubscribers: (() => void)[] = [];

        function finish() {
          if (finished) return;
          finished = true;
          if (finishTimer) {
            clearTimeout(finishTimer);
            finishTimer = null;
          }
          unsubscribers.forEach((u) => u());
          try {
            controller.close();
          } catch {
            // already closed
          }
        }

        function enqueue(chunk: UIMessageChunk) {
          if (finished) return;
          try {
            controller.enqueue(chunk);
          } catch {
            // stream closed
          }
        }

        function cancelPendingFinish(): void {
          if (finishTimer) {
            clearTimeout(finishTimer);
            finishTimer = null;
          }
        }

        function ensureStreamStarted(messageId: number): void {
          if (streamMessageId) return;
          streamMessageId = String(messageId);
          enqueue({ type: 'start', messageId: streamMessageId });
        }

        function closeCurrentStep(): void {
          if (reasoningId) {
            enqueue({ type: 'reasoning-end', id: reasoningId });
            reasoningId = null;
          }
          if (textPartId) {
            enqueue({ type: 'text-end', id: textPartId });
            textPartId = null;
          }
          if (stepOpen) {
            enqueue({ type: 'finish-step' });
            stepOpen = false;
          }
        }

        function ensureStepForMessage(messageId: number): void {
          ensureStreamStarted(messageId);
          if (activeLlmMessageId === messageId && stepOpen) return;
          closeCurrentStep();
          activeLlmMessageId = messageId;
          enqueue({ type: 'start-step' });
          stepOpen = true;
        }

        function scheduleFinishIfIdle(): void {
          cancelPendingFinish();
          finishTimer = setTimeout(() => {
            closeCurrentStep();
            enqueue({ type: 'finish' });
            finish();
          }, 0);
        }

        // Requirements: agents.12.7 — subscribe to MESSAGE_CREATED for llm/error messages
        const unsubCreated = eventBus.subscribe(
          EVENT_TYPES.MESSAGE_CREATED,
          (payload: MessageCreatedPayload) => {
            const msg = payload.message;
            if (msg.agentId !== agentId) return;
            cancelPendingFinish();

            if (msg.kind === 'llm') {
              ensureStepForMessage(msg.id);

              // If message is already completed with text (non-streaming case), emit it now.
              const data = msg.payload.data as Record<string, unknown> | undefined;
              const text = data?.text;
              if (msg.done && typeof text === 'string' && text.length > 0) {
                textPartId = `text-${msg.id}`;
                enqueue({ type: 'text-start', id: textPartId });
                enqueue({ type: 'text-delta', id: textPartId, delta: text });
                enqueue({ type: 'text-end', id: textPartId });
                textPartId = null;
                closeCurrentStep();
                scheduleFinishIfIdle();
              }
            } else if (msg.kind === 'error') {
              // Requirements: llm-integration.3.4 — error messages
              const data = msg.payload.data as Record<string, unknown> | undefined;
              const error = data?.error as { message?: string } | undefined;
              const errorMsg = error?.message ?? 'An error occurred';
              enqueue({ type: 'start', messageId: String(msg.id) });
              enqueue({ type: 'error', errorText: errorMsg });
              enqueue({ type: 'finish' });
              finish();
            }
          }
        );

        // Requirements: agents.12.7 — subscribe to MESSAGE_UPDATED for streaming completion
        const unsubUpdated = eventBus.subscribe(
          EVENT_TYPES.MESSAGE_UPDATED,
          (payload: MessageUpdatedPayload) => {
            const msg = payload.message;
            if (msg.agentId !== agentId) return;
            cancelPendingFinish();
            if (activeLlmMessageId === null && msg.kind === 'llm' && msg.done) {
              ensureStepForMessage(msg.id);

              const data = msg.payload.data as Record<string, unknown> | undefined;
              const reasoning = data?.reasoning as { text?: string } | undefined;
              if (typeof reasoning?.text === 'string' && reasoning.text.length > 0) {
                const doneReasoningId = `reasoning-${msg.id}`;
                enqueue({ type: 'reasoning-start', id: doneReasoningId });
                enqueue({ type: 'reasoning-delta', id: doneReasoningId, delta: reasoning.text });
                enqueue({ type: 'reasoning-end', id: doneReasoningId });
              }

              const text = data?.text;
              if (typeof text === 'string' && text.length > 0) {
                const doneTextId = `text-${msg.id}`;
                enqueue({ type: 'text-start', id: doneTextId });
                enqueue({ type: 'text-delta', id: doneTextId, delta: text });
                enqueue({ type: 'text-end', id: doneTextId });
              }

              closeCurrentStep();
              scheduleFinishIfIdle();
              return;
            }
            if (msg.id !== activeLlmMessageId) return;

            // Hidden = cancelled previous response, close stream without content
            if (msg.hidden) {
              closeCurrentStep();
              finish();
              return;
            }

            if (msg.done) {
              if (reasoningId) {
                enqueue({ type: 'reasoning-end', id: reasoningId });
                reasoningId = null;
              }
              if (textPartId) {
                enqueue({ type: 'text-end', id: textPartId });
                textPartId = null;
              } else {
                const data = msg.payload.data as Record<string, unknown> | undefined;
                const text = data?.text;
                if (typeof text === 'string' && text.length > 0) {
                  const doneTextId = `text-${msg.id}`;
                  enqueue({ type: 'text-start', id: doneTextId });
                  enqueue({ type: 'text-delta', id: doneTextId, delta: text });
                  enqueue({ type: 'text-end', id: doneTextId });
                }
              }
              closeCurrentStep();
              scheduleFinishIfIdle();
            }
          }
        );

        // Requirements: llm-integration.7 — subscribe to reasoning streaming
        const unsubReasoning = eventBus.subscribe(
          EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED,
          (payload: MessageLlmReasoningUpdatedPayload) => {
            if (payload.agentId !== agentId) return;
            cancelPendingFinish();
            ensureStepForMessage(payload.messageId);

            if (!reasoningId) {
              reasoningId = `reasoning-${payload.messageId}`;
              enqueue({ type: 'reasoning-start', id: reasoningId });
            }
            enqueue({ type: 'reasoning-delta', id: reasoningId, delta: payload.delta });
          }
        );

        const unsubText = eventBus.subscribe(
          EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED,
          (payload: MessageLlmTextUpdatedPayload) => {
            if (payload.agentId !== agentId) return;
            cancelPendingFinish();
            ensureStepForMessage(payload.messageId);

            if (!textPartId) {
              textPartId = `text-${payload.messageId}`;
              enqueue({ type: 'text-start', id: textPartId });
            }

            enqueue({ type: 'text-delta', id: textPartId, delta: payload.delta });
          }
        );

        unsubscribers.push(unsubCreated, unsubUpdated, unsubReasoning, unsubText);

        // Handle abort signal
        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            finish();
          });
        }

        // Send the user message via IPC
        // Requirements: agents.4.3
        window.api.messages
          .create(agentId, 'user', {
            data: { text },
          })
          .then((result) => {
            if (!result.success) {
              enqueue({ type: 'error', errorText: result.error ?? 'Failed to send message' });
              enqueue({ type: 'finish' });
              finish();
            }
            // On success: wait for IPC events to drive the stream
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Failed to send message';
            enqueue({ type: 'error', errorText: msg });
            enqueue({ type: 'finish' });
            finish();
          });
      },
    });
  }

  // Requirements: llm-integration.8 — no server-side reconnect needed
  async reconnectToStream(
    _options: Parameters<ChatTransport<UIMessage>['reconnectToStream']>[0]
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
