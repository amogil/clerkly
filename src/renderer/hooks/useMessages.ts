// Requirements: agents.4, agents.7, agents.12

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
  error: string | null;
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
  const [error, setError] = useState<string | null>(null);

  // Load messages for agent
  const loadMessages = useCallback(async () => {
    if (!agentId) {
      setMessages([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await window.api.messages.list(agentId);
      if (result.success && result.data) {
        const messageList = result.data as Message[];
        // Parse payloads and sort by timestamp
        const parsed = messageList.map(parseMessagePayload);
        parsed.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        setMessages(parsed);
      } else {
        setError(result.error || 'Failed to load messages');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  // Load messages when agentId changes
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Send user message
  // Requirements: agents.4.3
  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      if (!agentId || !text.trim()) {
        return false;
      }

      try {
        const payload: MessagePayload = {
          kind: 'user',
          data: {
            text: text.trim(),
            reply_to_message_id: null,
          },
        };

        const result = await window.api.messages.create(agentId, payload);
        if (result.success) {
          // Message will be added via event
          return true;
        }
        setError(result.error || 'Failed to send message');
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
        return false;
      }
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
    error,
    sendMessage,
    refreshMessages: loadMessages,
  };
}
