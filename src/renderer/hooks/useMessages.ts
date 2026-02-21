// Requirements: agents.4, agents.7, agents.12, error-notifications.2, realtime-events.9

import { useState, useEffect, useCallback } from 'react';
import { useEventSubscription } from '../events/useEventSubscription';
import { EVENT_TYPES } from '../../shared/events/constants';
import type { MessagePayload } from '../../shared/utils/agentStatus';
import type {
  MessageCreatedPayload,
  MessageUpdatedPayload,
  MessageSnapshot,
} from '../../shared/events/types';
import { callApi } from '../utils/apiWrapper';

// Access window.api with proper typing
declare const window: Window & {
  api: {
    messages: {
      list: (agentId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
      create: (
        agentId: string,
        payload: MessagePayload
      ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    };
  };
};

interface UseMessagesResult {
  messages: MessageSnapshot[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<boolean>;
  refreshMessages: () => Promise<void>;
}

/**
 * Hook for managing messages for a specific agent
 * Provides message operations and real-time updates via events
 *
 * Architecture: Uses snapshots from API and events (realtime-events.9)
 * - Initial load: API returns MessageSnapshot[] with parsed payloads
 * - Live updates: Events contain MessageSnapshot with parsed payloads
 * - No business logic: Just displays data from snapshots
 */
export function useMessages(agentId: string | null): UseMessagesResult {
  const [messages, setMessages] = useState<MessageSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load messages for agent
  // Requirements: error-notifications.2 - Use callApi for automatic error handling
  // Requirements: realtime-events.9.8 - API returns MessageSnapshot[]
  const loadMessages = useCallback(async () => {
    if (!agentId) {
      setMessages([]);
      return;
    }

    setIsLoading(true);

    const messageList = await callApi<MessageSnapshot[]>(
      () =>
        window.api.messages.list(agentId) as Promise<{
          success: boolean;
          data?: MessageSnapshot[];
          error?: string;
        }>,
      'Loading messages'
    );

    if (messageList) {
      // Sort by timestamp (already Unix timestamp in snapshot)
      const sorted = [...messageList].sort((a, b) => a.timestamp - b.timestamp);
      setMessages(sorted);
    }

    setIsLoading(false);
  }, [agentId]);

  // Load messages when agentId changes
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Send user message
  // Requirements: agents.4.3, error-notifications.2 - Use callApi for automatic error handling
  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      if (!agentId || !text.trim()) {
        return false;
      }

      const payload: MessagePayload = {
        data: {
          text: text.trim(),
          reply_to_message_id: null,
        },
      };

      const result = await callApi<Record<string, never>>(
        () =>
          window.api.messages.create(agentId, 'user', payload).then((r) => ({
            ...r,
            data: r.success ? ({} as Record<string, never>) : undefined,
          })),
        'Sending message'
      );

      // If callApi returns null, it means there was an error (toast already shown)
      return result !== null;
    },
    [agentId]
  );

  // Subscribe to message events
  // Requirements: agents.12.7, realtime-events.9.4
  useEventSubscription(EVENT_TYPES.MESSAGE_CREATED, (payload: MessageCreatedPayload) => {
    // Event payload contains MessageSnapshot with parsed payload
    if (payload.message && payload.message.agentId === agentId) {
      setMessages((prev) => {
        // Add message if not already present
        if (prev.some((m) => m.id === payload.message.id)) {
          return prev;
        }
        const updated = [...prev, payload.message];
        // Sort by timestamp (Unix timestamp)
        updated.sort((a, b) => a.timestamp - b.timestamp);
        return updated;
      });
    }
  });

  // Requirements: realtime-events.9.5
  useEventSubscription(EVENT_TYPES.MESSAGE_UPDATED, (payload: MessageUpdatedPayload) => {
    // Event payload contains MessageSnapshot with updated payload
    if (payload.message) {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === payload.message.id ? payload.message : msg))
      );
    }
  });

  return {
    messages,
    isLoading,
    sendMessage,
    refreshMessages: loadMessages,
  };
}
