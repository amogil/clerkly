// Requirements: agents.4, agents.7, agents.12, error-notifications.2

import { useState, useEffect, useCallback } from 'react';
import { useEventSubscription } from '../events/useEventSubscription';
import { EVENT_TYPES } from '../../shared/events/constants';
import type { Message, MessagePayload, ParsedMessage } from '../types/agent';
import { parseMessagePayload } from '../types/agent';
import type {
  MessageCreatedPayload,
  MessageUpdatedPayload,
  Message as EventMessage,
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
  messages: ParsedMessage[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<boolean>;
  refreshMessages: () => Promise<void>;
}

/**
 * Convert event Message to renderer Message type
 */
function eventMessageToRendererMessage(eventMessage: EventMessage): Message {
  return {
    id: eventMessage.id,
    agentId: eventMessage.agentId,
    timestamp: eventMessage.timestamp,
    payloadJson: eventMessage.payloadJson,
  };
}

/**
 * Hook for managing messages for a specific agent
 * Provides message operations and real-time updates via events
 */
export function useMessages(agentId: string | null): UseMessagesResult {
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load messages for agent
  // Requirements: error-notifications.2 - Use callApi for automatic error handling
  const loadMessages = useCallback(async () => {
    if (!agentId) {
      setMessages([]);
      return;
    }

    setIsLoading(true);

    const messageList = await callApi<Message[]>(
      () =>
        window.api.messages.list(agentId) as Promise<{
          success: boolean;
          data?: Message[];
          error?: string;
        }>,
      'Loading messages'
    );

    if (messageList) {
      // Parse payloads and sort by timestamp
      const parsed = messageList.map(parseMessagePayload);
      parsed.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setMessages(parsed);
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
        kind: 'user',
        data: {
          text: text.trim(),
          reply_to_message_id: null,
        },
      };

      const result = await callApi<Record<string, never>>(
        () =>
          window.api.messages.create(agentId, payload).then((r) => ({
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
  // Requirements: agents.12.7
  useEventSubscription(EVENT_TYPES.MESSAGE_CREATED, (payload: MessageCreatedPayload) => {
    if (payload.data && payload.data.agentId === agentId) {
      const message = eventMessageToRendererMessage(payload.data);
      const parsed = parseMessagePayload(message);
      setMessages((prev) => {
        // Add message if not already present
        if (prev.some((m) => m.id === parsed.id)) {
          return prev;
        }
        const updated = [...prev, parsed];
        updated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return updated;
      });
    }
  });

  useEventSubscription(EVENT_TYPES.MESSAGE_UPDATED, (payload: MessageUpdatedPayload) => {
    const messageId = parseInt(payload.id, 10);
    if (!isNaN(messageId) && payload.changedFields.payloadJson) {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === messageId) {
            try {
              const newPayload = JSON.parse(payload.changedFields.payloadJson!) as MessagePayload;
              return { ...msg, payload: newPayload };
            } catch {
              return msg;
            }
          }
          return msg;
        })
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
