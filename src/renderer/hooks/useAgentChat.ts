// Requirements: agents.4, agents.7, agents.12, agents.13, llm-integration.2, llm-integration.3, llm-integration.7, llm-integration.8, realtime-events.9
// src/renderer/hooks/useAgentChat.ts
// Hook wrapping useChat with IPCChatTransport + lazy message loading

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useChat, Chat } from '@ai-sdk/react';
import { IPCChatTransport } from '../lib/IPCChatTransport';
import { toUIMessages, toUIMessage } from '../lib/messageMapper';
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
      listPaginated: (
        agentId: string,
        limit?: number,
        beforeId?: number
      ) => Promise<{
        success: boolean;
        data?: { messages: unknown[]; hasMore: boolean };
        error?: string;
      }>;
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
  /** Load older messages (scroll-up pagination) */
  loadMore: () => Promise<void>;
  /** True if there are older messages not yet loaded */
  hasMore: boolean;
}

const PAGE_SIZE = 50;

/**
 * useAgentChat — replaces useMessages, wraps useChat with IPCChatTransport.
 *
 * Responsibilities:
 * - Loads last PAGE_SIZE messages on mount via messages:list-paginated
 * - Provides loadMore() for scroll-up pagination
 * - Keeps rawMessages in sync with UIMessage[] for metadata access
 * - Handles MESSAGE_UPDATED hidden=true (cancel retry, interrupted llm)
 * - Delegates streaming to IPCChatTransport + useChat
 *
 * Requirements: agents.4, agents.13, llm-integration.2, llm-integration.8
 */
export function useAgentChat(agentId: string | null): UseAgentChatResult {
  // ── Initial history state ──────────────────────────────────────────────
  const [rawMessages, setRawMessages] = useState<MessageSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(() => Boolean(agentId));
  const [hasMore, setHasMore] = useState(false);
  // ID of the oldest loaded message — used as cursor for loadMore()
  const oldestIdRef = useRef<number | undefined>(undefined);

  // ── Chat instance (stable per agentId) ────────────────────────────────
  // Requirements: agents.13.1 — transport bound to agentId
  const chat = useMemo(() => {
    if (!agentId) return null;
    return new Chat({
      id: agentId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: new IPCChatTransport(agentId) as any,
    });
  }, [agentId]);

  // ── useChat ────────────────────────────────────────────────────────────
  const {
    messages,
    setMessages,
    sendMessage: chatSendMessage,
    status,
  } = useChat(chat ? { chat } : { id: '__no_agent__' });

  // ── Load initial history ───────────────────────────────────────────────
  // Requirements: agents.13.1, agents.13.2
  const loadInitial = useCallback(async () => {
    if (!agentId) {
      setRawMessages([]);
      setMessages([]);
      setHasMore(false);
      oldestIdRef.current = undefined;
      return;
    }

    setIsLoading(true);

    try {
      const result = await window.api.messages.listPaginated(agentId, PAGE_SIZE);
      if (result.success && result.data) {
        const snapshots = result.data.messages as MessageSnapshot[];
        setRawMessages(snapshots);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setMessages(toUIMessages(snapshots) as any);
        setHasMore(result.data.hasMore);
        oldestIdRef.current = snapshots.length > 0 ? snapshots[0]!.id : undefined;
      }
    } finally {
      // Ensure loading state renders at least once.
      await new Promise((resolve) => setTimeout(resolve, 0));
      setIsLoading(false);
    }
  }, [agentId, setMessages]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // ── loadMore (scroll-up pagination) ───────────────────────────────────
  // Requirements: agents.13.2, agents.13.4
  const loadMore = useCallback(async () => {
    if (!agentId || !hasMore || oldestIdRef.current === undefined) return;

    const result = await window.api.messages.listPaginated(agentId, PAGE_SIZE, oldestIdRef.current);

    if (result.success && result.data) {
      const older = result.data.messages as MessageSnapshot[];
      setRawMessages((prev) => [...older, ...prev]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMessages((prev) => [...(toUIMessages(older) as any), ...prev]);
      setHasMore(result.data.hasMore);
      if (older.length > 0) {
        oldestIdRef.current = older[0]!.id;
      }
    }
  }, [agentId, hasMore, setMessages]);

  // ── Sync new messages from IPC events into rawMessages ─────────────────
  // useChat handles UIMessage[] via IPCChatTransport stream.
  // rawMessages needs to be kept in sync for metadata access.
  // Requirements: agents.12.7, realtime-events.9.4
  useEventSubscription(EVENT_TYPES.MESSAGE_CREATED, (payload: MessageCreatedPayload) => {
    if (!payload.message || payload.message.agentId !== agentId) return;
    if (payload.message.hidden) return;

    setRawMessages((prev) => {
      if (prev.some((m) => m.id === payload.message.id)) return prev;
      return [...prev, payload.message];
    });
  });

  // Requirements: realtime-events.9.5, llm-integration.3.8, llm-integration.8.5
  useEventSubscription(EVENT_TYPES.MESSAGE_UPDATED, (payload: MessageUpdatedPayload) => {
    if (!payload.message || payload.message.agentId !== agentId) return;

    if (payload.message.hidden) {
      // Remove hidden message from both arrays
      // Requirements: llm-integration.3.8, llm-integration.8.5
      setRawMessages((prev) => prev.filter((m) => m.id !== payload.message.id));
      setMessages((prev) => prev.filter((m) => m.id !== String(payload.message.id)));
    } else {
      // Update existing message in rawMessages
      setRawMessages((prev) =>
        prev.map((m) => (m.id === payload.message.id ? payload.message : m))
      );
      // Sync UIMessage if it exists (e.g. error message text update)
      const uiMsg = toUIMessage(payload.message);
      if (uiMsg) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setMessages((prev) => prev.map((m) => (m.id === uiMsg.id ? (uiMsg as any) : m)));
      }
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

  const isStreaming = status === 'streaming' || status === 'submitted';

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
    rawMessages,
    isLoading,
    isStreaming,
    sendMessage,
    loadMore,
    hasMore,
  };
}
