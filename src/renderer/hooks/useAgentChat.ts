// Requirements: agents.4, agents.7, agents.12, agents.13, llm-integration.2, llm-integration.3, llm-integration.7, llm-integration.8, realtime-events.9
// src/renderer/hooks/useAgentChat.ts
// Hook wrapping useChat with IPCChatTransport

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useChat, Chat } from '@ai-sdk/react';
import { IPCChatTransport } from '../lib/IPCChatTransport';
import { toUIMessages } from '../lib/messageMapper';
import { sortMessageSnapshots } from '../lib/messageOrder';
import { useEventSubscription } from '../events/useEventSubscription';
import { EVENT_TYPES } from '../../shared/events/constants';
import type {
  MessageSnapshot,
  MessageCreatedPayload,
  MessageUpdatedPayload,
} from '../../shared/events/types';
import type { UIMessage } from 'ai';

// Access window.api with proper typing
declare const window: Window & {
  api: {
    messages: {
      list: (agentId: string) => Promise<{
        success: boolean;
        data?: unknown[];
        error?: string;
      }>;
      cancel: (agentId: string) => Promise<{ success: boolean; error?: string }>;
    };
  };
};

export interface UseAgentChatResult {
  /** AI SDK UIMessage[] — used by Conversation/AgentMessage for rendering */
  messages: UIMessage[];
  /** Original MessageSnapshot[] — used for kind, metadata, action_link access */
  rawMessages: MessageSnapshot[];
  /** True while initial history is loading */
  isLoading: boolean;
  /** True while LLM is streaming a response */
  isStreaming: boolean;
  /** Send a user text message */
  sendMessage: (text: string) => Promise<boolean>;
  /** Cancel active LLM request for this agent */
  cancelCurrentRequest: () => Promise<boolean>;
}

/**
 * useAgentChat — replaces useMessages, wraps useChat with IPCChatTransport.
 *
 * Responsibilities:
 * - Loads all messages on mount via messages:list
 * - Keeps rawMessages in sync with UIMessage[] for metadata access
 * - Handles MESSAGE_UPDATED hidden=true (cancel retry, cancelled llm)
 * - Delegates streaming to IPCChatTransport + useChat
 *
 * Requirements: agents.4, agents.13, llm-integration.2, llm-integration.8
 */
export function useAgentChat(agentId: string | null): UseAgentChatResult {
  const sanitizeUIMessages = useCallback(async (messages: UIMessage[]): Promise<UIMessage[]> => {
    try {
      const { validateUIMessages } = await import('ai');
      return await validateUIMessages({ messages });
    } catch {
      return messages;
    }
  }, []);

  // ── Initial history state ──────────────────────────────────────────────
  const [rawMessages, setRawMessages] = useState<MessageSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(() => Boolean(agentId));

  const syncPersistedMessages = useCallback(async () => {
    if (!agentId) {
      setRawMessages([]);
      return;
    }

    const result = await window.api.messages.list(agentId);
    if (result.success && result.data) {
      const snapshots = result.data as MessageSnapshot[];
      setRawMessages(sortMessageSnapshots(snapshots));
    }
  }, [agentId]);

  // ── Chat instance (stable per agentId) ────────────────────────────────
  // Requirements: agents.13.1 — transport bound to agentId
  const chat = useMemo(() => {
    if (!agentId) return null;
    return new Chat({
      id: agentId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: new IPCChatTransport(agentId) as any,
      onFinish: () => {
        // Align useChat lifecycle with persisted message snapshots.
        void syncPersistedMessages();
      },
      onError: () => {
        void syncPersistedMessages();
      },
    });
  }, [agentId, syncPersistedMessages]);

  // ── useChat ────────────────────────────────────────────────────────────
  const {
    messages,
    setMessages,
    sendMessage: chatSendMessage,
    stop: stopStreaming,
    status,
  } = useChat(chat ? { chat } : { id: '__no_agent__' });

  // ── Load initial history ───────────────────────────────────────────────
  // Requirements: agents.13.1, agents.13.2, agents.13.8
  const loadInitial = useCallback(async () => {
    if (!agentId) {
      setRawMessages([]);
      setMessages([]);
      return;
    }

    setIsLoading(true);

    try {
      const result = await window.api.messages.list(agentId);
      if (result.success && result.data) {
        const snapshots = result.data as MessageSnapshot[];
        const sortedSnapshots = sortMessageSnapshots(snapshots);
        setRawMessages(sortedSnapshots);
        const uiMessages = await sanitizeUIMessages(toUIMessages(sortedSnapshots));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setMessages(uiMessages as any);
      }
    } finally {
      // Ensure loading state renders at least once.
      await new Promise((resolve) => setTimeout(resolve, 0));
      setIsLoading(false);
    }
  }, [agentId, sanitizeUIMessages, setMessages]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // ── Sync new messages from IPC events into rawMessages ─────────────────
  // useChat handles UIMessage[] via IPCChatTransport stream.
  // rawMessages needs to be kept in sync for metadata access.
  // Requirements: agents.12.7, realtime-events.9.4
  useEventSubscription(EVENT_TYPES.MESSAGE_CREATED, (payload: MessageCreatedPayload) => {
    if (!payload.message || payload.message.agentId !== agentId) return;
    if (payload.message.hidden) return;

    setRawMessages((prev) => {
      if (prev.some((m) => m.id === payload.message.id)) return prev;
      return sortMessageSnapshots([...prev, payload.message]);
    });
  });

  // Requirements: realtime-events.9.5, llm-integration.3.8, llm-integration.8.5
  useEventSubscription(EVENT_TYPES.MESSAGE_UPDATED, (payload: MessageUpdatedPayload) => {
    if (!payload.message || payload.message.agentId !== agentId) return;

    if (payload.message.hidden) {
      // Remove hidden message from persisted snapshot list used for rendering.
      // Requirements: llm-integration.3.8, llm-integration.8.5
      setRawMessages((prev) => prev.filter((m) => m.id !== payload.message.id));
    } else {
      // Upsert in rawMessages to tolerate out-of-order updated/created events.
      setRawMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === payload.message.id);
        if (existingIndex === -1) {
          return sortMessageSnapshots([...prev, payload.message]);
        }
        return sortMessageSnapshots(
          prev.map((m) => (m.id === payload.message.id ? payload.message : m))
        );
      });
    }
  });

  // ── sendMessage wrapper ────────────────────────────────────────────────
  // Requirements: agents.4.3, llm-integration.2
  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      if (!agentId || !text.trim()) return false;
      try {
        await chatSendMessage({ text: text.trim() });
        return true;
      } catch {
        return false;
      }
    },
    [agentId, chatSendMessage]
  );

  // Requirements: llm-integration.8.1, llm-integration.8.7, agents.4.24.3
  const cancelCurrentRequest = useCallback(async (): Promise<boolean> => {
    if (!agentId) return false;
    stopStreaming();
    try {
      const result = await window.api.messages.cancel(agentId);
      // Stop-cancel failures are treated as non-fatal and must not surface as toast errors.
      if (!result.success) return false;
      return true;
    } catch {
      return false;
    }
  }, [agentId, stopStreaming]);

  const isStreaming = status === 'streaming' || status === 'submitted';

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
    rawMessages,
    isLoading,
    isStreaming,
    sendMessage,
    cancelCurrentRequest,
  };
}
