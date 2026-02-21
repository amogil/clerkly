/**
 * @jest-environment jsdom
 */
// Requirements: agents.4, agents.7, agents.12, error-notifications.2, realtime-events.9
/**
 * Unit tests for useMessages hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { EVENT_TYPES } from '../../../src/shared/events/constants';
import type { MessageSnapshot } from '../../../src/shared/events/types';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
  },
}));

// Mock window.api
const mockMessagesApi = {
  list: jest.fn(),
  create: jest.fn(),
};

// Mock RendererEventBus
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('../../../src/renderer/events/RendererEventBus', () => ({
  RendererEventBus: {
    getInstance: jest.fn(() => ({
      subscribe: mockSubscribe,
      subscribeAll: jest.fn(),
      publish: jest.fn(),
    })),
  },
}));

// Set up window.api
(window as any).api = {
  messages: mockMessagesApi,
};

// Import hook after mocks are set up
import { useMessages } from '../../../src/renderer/hooks/useMessages';

describe('useMessages hook', () => {
  const mockMessages: MessageSnapshot[] = [
    {
      id: 1,
      agentId: 'agent-1',
      kind: 'user',
      timestamp: new Date('2024-01-01T10:00:00Z').getTime(),
      payload: { data: { text: 'Hello' } },
      hidden: false,
    },
    {
      id: 2,
      agentId: 'agent-1',
      kind: 'llm',
      timestamp: new Date('2024-01-01T10:01:00Z').getTime(),
      payload: { data: { text: 'Hi there!' } },
      hidden: false,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue(mockUnsubscribe);
    mockMessagesApi.list.mockResolvedValue({ success: true, data: [...mockMessages] });
    mockMessagesApi.create.mockResolvedValue({ success: true, data: mockMessages[0] });
  });

  describe('initial load', () => {
    /* Preconditions: Hook mounts with agentId
       Action: useMessages is called
       Assertions: Messages are loaded from API
       Requirements: agents.4.8 */
    it('should load messages on mount', async () => {
      const { result } = renderHook(() => useMessages('agent-1'));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockMessagesApi.list).toHaveBeenCalledWith('agent-1');
      expect(result.current.messages).toHaveLength(2);
    });

    /* Preconditions: Hook mounts with null agentId
       Action: useMessages is called with null
       Assertions: No API call, empty messages
       Requirements: agents.4 */
    it('should not load messages when agentId is null', async () => {
      const { result } = renderHook(() => useMessages(null));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockMessagesApi.list).not.toHaveBeenCalled();
      expect(result.current.messages).toHaveLength(0);
    });

    /* Preconditions: Hook mounts with messages
       Action: useMessages is called
       Assertions: Messages are sorted by timestamp ascending
       Requirements: agents.4.8 */
    it('should sort messages by timestamp ascending', async () => {
      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.messages[0].id).toBe(1);
      expect(result.current.messages[1].id).toBe(2);
    });

    /* Preconditions: Hook mounts with messages
       Action: useMessages is called
       Assertions: Messages have parsed payloads
       Requirements: agents.7.2 */
    it('should parse message payloads', async () => {
      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.messages[0].payload.data?.text).toBe('Hello');
      expect(result.current.messages[1].kind).toBe('llm');
    });

    /* Preconditions: API returns error
       Action: useMessages is called
       Assertions: Toast error is shown
       Requirements: agents.4, error-notifications.2 */
    it('should show toast on API failure', async () => {
      const { toast } = require('sonner');
      mockMessagesApi.list.mockResolvedValue({ success: false, error: 'Network error' });

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(toast.error).toHaveBeenCalledWith('Loading messages: Network error');
    });
  });

  describe('agentId change', () => {
    /* Preconditions: Hook is mounted
       Action: agentId changes
       Assertions: Messages are reloaded for new agent
       Requirements: agents.4.8 */
    it('should reload messages when agentId changes', async () => {
      const { result, rerender } = renderHook(({ agentId }) => useMessages(agentId), {
        initialProps: { agentId: 'agent-1' },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockMessagesApi.list).toHaveBeenCalledWith('agent-1');

      const newMessages: MessageSnapshot[] = [
        {
          id: 3,
          agentId: 'agent-2',
          kind: 'user',
          timestamp: new Date('2024-01-02T10:00:00Z').getTime(),
          payload: { data: { text: 'Different agent' } },
          hidden: false,
        },
      ];
      mockMessagesApi.list.mockResolvedValue({ success: true, data: newMessages });

      rerender({ agentId: 'agent-2' });

      await waitFor(() => {
        expect(mockMessagesApi.list).toHaveBeenCalledWith('agent-2');
      });
    });

    /* Preconditions: Hook is mounted with agentId
       Action: agentId changes to null
       Assertions: Messages are cleared
       Requirements: agents.4 */
    it('should clear messages when agentId becomes null', async () => {
      const { result, rerender } = renderHook(({ agentId }) => useMessages(agentId), {
        initialProps: { agentId: 'agent-1' as string | null },
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBe(2);
      });

      rerender({ agentId: null });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(0);
      });
    });
  });

  describe('sendMessage', () => {
    /* Preconditions: Hook is mounted with agentId
       Action: sendMessage is called
       Assertions: API is called with correct payload
       Requirements: agents.4.3 */
    it('should send message with correct payload', async () => {
      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success = false;
      await act(async () => {
        success = await result.current.sendMessage('Test message');
      });

      expect(mockMessagesApi.create).toHaveBeenCalledWith('agent-1', 'user', {
        data: {
          text: 'Test message',
          reply_to_message_id: null,
        },
      });
      expect(success).toBe(true);
    });

    /* Preconditions: Hook is mounted with null agentId
       Action: sendMessage is called
       Assertions: Returns false without API call
       Requirements: agents.4.3 */
    it('should return false when agentId is null', async () => {
      const { result } = renderHook(() => useMessages(null));

      let success = true;
      await act(async () => {
        success = await result.current.sendMessage('Test message');
      });

      expect(mockMessagesApi.create).not.toHaveBeenCalled();
      expect(success).toBe(false);
    });

    /* Preconditions: Hook is mounted
       Action: sendMessage is called with empty text
       Assertions: Returns false without API call
       Requirements: agents.4.3 */
    it('should return false for empty message', async () => {
      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success = true;
      await act(async () => {
        success = await result.current.sendMessage('   ');
      });

      expect(mockMessagesApi.create).not.toHaveBeenCalled();
      expect(success).toBe(false);
    });

    /* Preconditions: Hook is mounted
       Action: sendMessage fails
       Assertions: Error is set
       Requirements: agents.4 */
    it('should set error on send failure', async () => {
      const { toast } = require('sonner');
      mockMessagesApi.create.mockResolvedValue({ success: false, error: 'Send failed' });

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success = true;
      await act(async () => {
        success = await result.current.sendMessage('Test');
      });

      expect(success).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('Sending message: Send failed');
    });
  });

  describe('event subscriptions', () => {
    /* Preconditions: Hook mounts
       Action: useMessages is called
       Assertions: Subscribes to message events
       Requirements: agents.12.7 */
    it('should subscribe to message events', async () => {
      renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });

      const subscribedEvents = mockSubscribe.mock.calls.map((call) => call[0]);
      expect(subscribedEvents).toContain(EVENT_TYPES.MESSAGE_CREATED);
      expect(subscribedEvents).toContain(EVENT_TYPES.MESSAGE_UPDATED);
      expect(subscribedEvents).toContain(EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED);
    });

    /* Preconditions: Hook is mounted
       Action: MESSAGE_CREATED event is received for current agent
       Assertions: New message is added to list
       Requirements: agents.12.7, realtime-events.9.4 */
    it('should add message on MESSAGE_CREATED event', async () => {
      let createdHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.MESSAGE_CREATED) {
          createdHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCount = result.current.messages.length;

      act(() => {
        createdHandler({
          timestamp: Date.now(),
          message: {
            id: 3,
            agentId: 'agent-1',
            kind: 'user',
            timestamp: new Date('2024-01-01T10:02:00Z').getTime(),
            payload: { data: { text: 'New message' } },
            hidden: false,
          },
        });
      });

      expect(result.current.messages.length).toBe(initialCount + 1);
    });

    /* Preconditions: Hook is mounted
       Action: MESSAGE_CREATED event is received for different agent
       Assertions: Message is not added
       Requirements: agents.12.7, realtime-events.9.4 */
    it('should ignore MESSAGE_CREATED for different agent', async () => {
      let createdHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.MESSAGE_CREATED) {
          createdHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCount = result.current.messages.length;

      act(() => {
        createdHandler({
          timestamp: Date.now(),
          message: {
            id: 3,
            agentId: 'agent-2', // Different agent
            kind: 'user',
            timestamp: new Date('2024-01-01T10:02:00Z').getTime(),
            payload: { data: { text: 'New message' } },
            hidden: false,
          },
        });
      });

      expect(result.current.messages.length).toBe(initialCount);
    });

    /* Preconditions: Hook is mounted with messages
       Action: MESSAGE_CREATED event with duplicate id
       Assertions: Message is not duplicated
       Requirements: agents.12.7, realtime-events.9.4 */
    it('should not duplicate message on repeated event', async () => {
      let createdHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.MESSAGE_CREATED) {
          createdHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCount = result.current.messages.length;

      // Send same message twice
      act(() => {
        createdHandler({
          timestamp: Date.now(),
          message: {
            id: 1, // Same id as existing message
            agentId: 'agent-1',
            kind: 'user',
            timestamp: new Date('2024-01-01T10:00:00Z').getTime(),
            payload: { data: { text: 'Hello' } },
            hidden: false,
          },
        });
      });

      expect(result.current.messages.length).toBe(initialCount);
    });

    /* Preconditions: Hook is mounted
       Action: MESSAGE_CREATED event with no message
       Assertions: No error, messages unchanged
       Requirements: agents.12.7, realtime-events.9.4 */
    it('should handle MESSAGE_CREATED event with no message', async () => {
      let createdHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.MESSAGE_CREATED) {
          createdHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCount = result.current.messages.length;

      act(() => {
        createdHandler({
          timestamp: Date.now(),
          message: null,
        });
      });

      expect(result.current.messages.length).toBe(initialCount);
    });

    /* Preconditions: Hook is mounted
       Action: MESSAGE_UPDATED event is received
       Assertions: Message is replaced with updated snapshot
       Requirements: agents.12.7, realtime-events.9.5 */
    it('should update message on MESSAGE_UPDATED event', async () => {
      let updatedHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.MESSAGE_UPDATED) {
          updatedHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        updatedHandler({
          timestamp: Date.now(),
          message: {
            id: 1,
            agentId: 'agent-1',
            kind: 'user',
            timestamp: new Date('2024-01-01T10:00:00Z').getTime(),
            payload: { data: { text: 'Updated text' } },
            hidden: false,
          },
        });
      });

      const updatedMessage = result.current.messages.find((m) => m.id === 1);
      expect(updatedMessage?.payload.data?.text).toBe('Updated text');
    });

    /* Preconditions: Hook is mounted
       Action: MESSAGE_UPDATED event with no message
       Assertions: Messages unchanged
       Requirements: agents.12.7, realtime-events.9.5 */
    it('should handle MESSAGE_UPDATED event with no message', async () => {
      let updatedHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.MESSAGE_UPDATED) {
          updatedHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const originalText = result.current.messages[0]?.payload.data?.text;

      act(() => {
        updatedHandler({
          timestamp: Date.now(),
          message: null,
        });
      });

      expect(result.current.messages[0]?.payload.data?.text).toBe(originalText);
    });

    /* Preconditions: Hook is mounted
       Action: MESSAGE_UPDATED event for non-existent message
       Assertions: No error, messages unchanged
       Requirements: agents.12.7, realtime-events.9.5 */
    it('should handle MESSAGE_UPDATED event for non-existent message', async () => {
      let updatedHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.MESSAGE_UPDATED) {
          updatedHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCount = result.current.messages.length;

      act(() => {
        updatedHandler({
          timestamp: Date.now(),
          message: {
            id: 999, // Non-existent message
            agentId: 'agent-1',
            kind: 'user',
            timestamp: new Date('2024-01-01T10:00:00Z').getTime(),
            payload: { data: { text: 'Should not apply' } },
            hidden: false,
          },
        });
      });

      expect(result.current.messages.length).toBe(initialCount);
    });
  });

  describe('MESSAGE_LLM_REASONING_UPDATED event', () => {
    /* Preconditions: Hook is mounted with an llm message in state
       Action: MESSAGE_LLM_REASONING_UPDATED event is received for current agent
       Assertions: reasoning.text is updated in the matching message
       Requirements: llm-integration.7 */
    it('should update reasoning in matching message for current agent', async () => {
      const llmMessage: MessageSnapshot = {
        id: 10,
        agentId: 'agent-1',
        kind: 'llm',
        timestamp: new Date('2024-01-01T10:02:00Z').getTime(),
        payload: { data: {} },
        hidden: false,
      };
      mockMessagesApi.list.mockResolvedValue({
        success: true,
        data: [...mockMessages, llmMessage],
      });

      let reasoningHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED) {
          reasoningHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        reasoningHandler({
          messageId: 10,
          agentId: 'agent-1',
          delta: 'thinking...',
          accumulatedText: 'thinking...',
        });
      });

      const updated = result.current.messages.find((m) => m.id === 10);
      const data = updated?.payload.data as Record<string, unknown> | undefined;
      const reasoning = data?.['reasoning'] as { text?: string } | undefined;
      expect(reasoning?.text).toBe('thinking...');
    });

    /* Preconditions: Hook is mounted with an llm message in state
       Action: MESSAGE_LLM_REASONING_UPDATED event is received for a different agent
       Assertions: reasoning is NOT updated (event ignored)
       Requirements: llm-integration.7 */
    it('should ignore MESSAGE_LLM_REASONING_UPDATED for different agent', async () => {
      const llmMessage: MessageSnapshot = {
        id: 10,
        agentId: 'agent-1',
        kind: 'llm',
        timestamp: new Date('2024-01-01T10:02:00Z').getTime(),
        payload: { data: {} },
        hidden: false,
      };
      mockMessagesApi.list.mockResolvedValue({
        success: true,
        data: [...mockMessages, llmMessage],
      });

      let reasoningHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED) {
          reasoningHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        reasoningHandler({
          messageId: 10,
          agentId: 'agent-2', // different agent
          delta: 'thinking...',
          accumulatedText: 'thinking...',
        });
      });

      const msg = result.current.messages.find((m) => m.id === 10);
      const data = msg?.payload.data as Record<string, unknown> | undefined;
      expect(data?.['reasoning']).toBeUndefined();
    });
  });

  describe('refreshMessages', () => {
    /* Preconditions: Hook is mounted
       Action: refreshMessages is called
       Assertions: Messages are reloaded from API
       Requirements: agents.4 */
    it('should reload messages from API', async () => {
      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockMessagesApi.list).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refreshMessages();
      });

      expect(mockMessagesApi.list).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    /* Preconditions: API throws exception
       Action: useMessages is called
       Assertions: Toast error is shown
       Requirements: agents.4, error-notifications.2 */
    it('should show toast on API exceptions', async () => {
      const { toast } = require('sonner');
      mockMessagesApi.list.mockRejectedValue(new Error('Network failure'));

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(toast.error).toHaveBeenCalledWith('Loading messages: Network failure');
    });

    /* Preconditions: API throws non-Error
       Action: useMessages is called
       Assertions: Toast error is shown
       Requirements: agents.4, error-notifications.2 */
    it('should show toast on non-Error exceptions', async () => {
      const { toast } = require('sonner');
      mockMessagesApi.list.mockRejectedValue('Unknown error');

      const { result } = renderHook(() => useMessages('agent-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(toast.error).toHaveBeenCalledWith('Loading messages: Unknown error');
    });
  });
});
