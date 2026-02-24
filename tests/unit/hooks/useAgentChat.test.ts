/**
 * @jest-environment jsdom
 */
// Requirements: agents.4, agents.7, agents.12, agents.13, llm-integration.2, llm-integration.8, realtime-events.9
// tests/unit/hooks/useAgentChat.test.ts
// Unit tests for useAgentChat hook

import { renderHook, act, waitFor } from '@testing-library/react';
import { EVENT_TYPES } from '../../../src/shared/events/constants';
import type { MessageSnapshot } from '../../../src/shared/events/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock @ai-sdk/react useChat + Chat
const mockSetMessages = jest.fn();
const mockChatSendMessage = jest.fn().mockResolvedValue(undefined);
const mockStatus = { current: 'ready' as string };

jest.mock('@ai-sdk/react', () => {
  const Chat = jest.fn().mockImplementation(() => ({ id: 'mock-chat' }));
  const useChat = jest.fn().mockImplementation(() => ({
    messages: [],
    setMessages: mockSetMessages,
    sendMessage: mockChatSendMessage,
    get status() {
      return mockStatus.current;
    },
  }));
  return { Chat, useChat };
});

// Mock IPCChatTransport
jest.mock('../../../src/renderer/lib/IPCChatTransport', () => ({
  IPCChatTransport: jest.fn().mockImplementation(() => ({})),
}));

// Mock messageMapper
const mockToUIMessages = jest.fn();
const mockToUIMessage = jest.fn();
jest.mock('../../../src/renderer/lib/messageMapper', () => ({
  toUIMessages: (...args: unknown[]) => mockToUIMessages(...args),
  toUIMessage: (...args: unknown[]) => mockToUIMessage(...args),
}));

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

// Mock window.api
const mockListPaginated = jest.fn();
(window as unknown as { api: unknown }).api = {
  messages: {
    listPaginated: mockListPaginated,
  },
};

// Import hook after mocks
import { useAgentChat } from '../../../src/renderer/hooks/useAgentChat';

// ── Fixtures ───────────────────────────────────────────────────────────────

const makeSnapshot = (id: number, kind = 'user', hidden = false): MessageSnapshot => ({
  id,
  agentId: 'agent-1',
  kind,
  timestamp: Date.now(),
  payload: { data: { text: `msg ${id}` } },
  hidden,
});

const makeUIMessage = (id: number) => ({
  id: String(id),
  role: 'user' as const,
  parts: [{ type: 'text' as const, text: `msg ${id}` }],
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useAgentChat hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue(mockUnsubscribe);
    mockStatus.current = 'ready';

    // Default: empty history
    mockListPaginated.mockResolvedValue({
      success: true,
      data: { messages: [], hasMore: false },
    });
    mockToUIMessages.mockReturnValue([]);
    mockToUIMessage.mockReturnValue(null);

    // Reset setMessages mock to track calls
    mockSetMessages.mockReset();
  });

  // ── Initial load ─────────────────────────────────────────────────────────

  describe('initial load', () => {
    /* Preconditions: agentId provided, API returns 2 messages
       Action: Hook mounts
       Assertions: listPaginated called with agentId and PAGE_SIZE=50, rawMessages set
       Requirements: agents.13.1, agents.13.2 */
    it('should load initial messages on mount', async () => {
      const snapshots = [makeSnapshot(1), makeSnapshot(2)];
      const uiMessages = [makeUIMessage(1), makeUIMessage(2)];
      mockListPaginated.mockResolvedValue({
        success: true,
        data: { messages: snapshots, hasMore: false },
      });
      mockToUIMessages.mockReturnValue(uiMessages);

      const { result } = renderHook(() => useAgentChat('agent-1'));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockListPaginated).toHaveBeenCalledWith('agent-1', 50);
      expect(result.current.rawMessages).toEqual(snapshots);
      expect(result.current.hasMore).toBe(false);
    });

    /* Preconditions: agentId provided, API returns hasMore=true
       Action: Hook mounts
       Assertions: hasMore is true
       Requirements: agents.13.2 */
    it('should set hasMore=true when more pages exist', async () => {
      const snapshots = Array.from({ length: 50 }, (_, i) => makeSnapshot(i + 1));
      mockListPaginated.mockResolvedValue({
        success: true,
        data: { messages: snapshots, hasMore: true },
      });
      mockToUIMessages.mockReturnValue([]);

      const { result } = renderHook(() => useAgentChat('agent-1'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasMore).toBe(true);
    });

    /* Preconditions: agentId is null
       Action: Hook mounts
       Assertions: No API call, empty state
       Requirements: agents.13.1 */
    it('should not load when agentId is null', async () => {
      const { result } = renderHook(() => useAgentChat(null));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockListPaginated).not.toHaveBeenCalled();
      expect(result.current.rawMessages).toEqual([]);
      expect(result.current.hasMore).toBe(false);
    });

    /* Preconditions: agentId provided, API returns success:false
       Action: Hook mounts
       Assertions: rawMessages stays empty, no crash
       Requirements: agents.13.1 */
    it('should handle API failure gracefully', async () => {
      mockListPaginated.mockResolvedValue({ success: false, error: 'DB error' });

      const { result } = renderHook(() => useAgentChat('agent-1'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.rawMessages).toEqual([]);
    });
  });

  // ── loadMore ─────────────────────────────────────────────────────────────

  describe('loadMore', () => {
    /* Preconditions: Initial load done, hasMore=true, oldestId=1
       Action: loadMore() called
       Assertions: listPaginated called with beforeId=1, older messages prepended
       Requirements: agents.13.2, agents.13.4 */
    it('should load older messages with beforeId cursor', async () => {
      const initial = [makeSnapshot(10), makeSnapshot(20)];
      const older = [makeSnapshot(5), makeSnapshot(8)];
      const olderUI = [makeUIMessage(5), makeUIMessage(8)];

      mockListPaginated
        .mockResolvedValueOnce({
          success: true,
          data: { messages: initial, hasMore: true },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { messages: older, hasMore: false },
        });

      mockToUIMessages.mockReturnValue([]);

      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Simulate loadMore
      mockToUIMessages.mockReturnValue(olderUI);
      await act(async () => {
        await result.current.loadMore();
      });

      // Should call with beforeId = oldest message id (10)
      expect(mockListPaginated).toHaveBeenCalledWith('agent-1', 50, 10);
      expect(result.current.rawMessages).toEqual([...older, ...initial]);
      expect(result.current.hasMore).toBe(false);
    });

    /* Preconditions: hasMore=false
       Action: loadMore() called
       Assertions: No API call made
       Requirements: agents.13.2 */
    it('should not call API when hasMore is false', async () => {
      mockListPaginated.mockResolvedValue({
        success: true,
        data: { messages: [], hasMore: false },
      });

      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.loadMore();
      });

      // Only the initial load call
      expect(mockListPaginated).toHaveBeenCalledTimes(1);
    });
  });

  // ── sendMessage ───────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    /* Preconditions: agentId set, text provided
       Action: sendMessage('hello') called
       Assertions: chatSendMessage called with { text: 'hello' }, returns true
       Requirements: agents.4.3, llm-integration.2 */
    it('should call chatSendMessage and return true on success', async () => {
      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.sendMessage('hello');
      });

      expect(mockChatSendMessage).toHaveBeenCalledWith({ text: 'hello' });
      expect(success).toBe(true);
    });

    /* Preconditions: agentId set, empty text
       Action: sendMessage('') called
       Assertions: chatSendMessage NOT called, returns false
       Requirements: agents.4.3 */
    it('should return false for empty text', async () => {
      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.sendMessage('   ');
      });

      expect(mockChatSendMessage).not.toHaveBeenCalled();
      expect(success).toBe(false);
    });

    /* Preconditions: agentId is null
       Action: sendMessage('hello') called
       Assertions: returns false
       Requirements: agents.4.3 */
    it('should return false when agentId is null', async () => {
      const { result } = renderHook(() => useAgentChat(null));

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.sendMessage('hello');
      });

      expect(success).toBe(false);
    });

    /* Preconditions: chatSendMessage throws
       Action: sendMessage('hello') called
       Assertions: returns false (no crash)
       Requirements: agents.4.3 */
    it('should return false when chatSendMessage throws', async () => {
      mockChatSendMessage.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.sendMessage('hello');
      });

      expect(success).toBe(false);
    });
  });

  // ── isStreaming ───────────────────────────────────────────────────────────

  describe('isStreaming', () => {
    /* Preconditions: useChat status is 'streaming'
       Action: Check isStreaming
       Assertions: isStreaming is true
       Requirements: llm-integration.2 */
    it('should be true when status is streaming', async () => {
      mockStatus.current = 'streaming';

      const { result } = renderHook(() => useAgentChat('agent-1'));

      expect(result.current.isStreaming).toBe(true);
    });

    /* Preconditions: useChat status is 'submitted'
       Action: Check isStreaming
       Assertions: isStreaming is true
       Requirements: llm-integration.2 */
    it('should be true when status is submitted', async () => {
      mockStatus.current = 'submitted';

      const { result } = renderHook(() => useAgentChat('agent-1'));

      expect(result.current.isStreaming).toBe(true);
    });

    /* Preconditions: useChat status is 'ready'
       Action: Check isStreaming
       Assertions: isStreaming is false
       Requirements: llm-integration.2 */
    it('should be false when status is ready', async () => {
      mockStatus.current = 'ready';

      const { result } = renderHook(() => useAgentChat('agent-1'));

      expect(result.current.isStreaming).toBe(false);
    });
  });

  // ── EVENT: MESSAGE_CREATED ────────────────────────────────────────────────

  describe('MESSAGE_CREATED event', () => {
    /* Preconditions: Hook mounted, new message arrives for this agent
       Action: MESSAGE_CREATED event emitted
       Assertions: rawMessages updated with new snapshot
       Requirements: agents.12.7, realtime-events.9.4 */
    it('should add new message to rawMessages on MESSAGE_CREATED', async () => {
      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Find the MESSAGE_CREATED subscriber
      const createdHandler = mockSubscribe.mock.calls.find(
        ([type]: [string]) => type === EVENT_TYPES.MESSAGE_CREATED
      )?.[1];
      expect(createdHandler).toBeDefined();

      const newMsg = makeSnapshot(99, 'llm');
      act(() => {
        createdHandler({ message: newMsg, timestamp: Date.now() });
      });

      expect(result.current.rawMessages).toContainEqual(newMsg);
    });

    /* Preconditions: Hook mounted, hidden message arrives
       Action: MESSAGE_CREATED event with hidden=true
       Assertions: rawMessages NOT updated
       Requirements: llm-integration.3.8 */
    it('should ignore hidden messages in MESSAGE_CREATED', async () => {
      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const createdHandler = mockSubscribe.mock.calls.find(
        ([type]: [string]) => type === EVENT_TYPES.MESSAGE_CREATED
      )?.[1];

      const hiddenMsg = makeSnapshot(99, 'llm', true);
      act(() => {
        createdHandler({ message: hiddenMsg, timestamp: Date.now() });
      });

      expect(result.current.rawMessages).not.toContainEqual(hiddenMsg);
    });

    /* Preconditions: Hook mounted, message from different agent arrives
       Action: MESSAGE_CREATED event for other-agent
       Assertions: rawMessages NOT updated
       Requirements: realtime-events.9.4 */
    it('should ignore messages from other agents', async () => {
      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const createdHandler = mockSubscribe.mock.calls.find(
        ([type]: [string]) => type === EVENT_TYPES.MESSAGE_CREATED
      )?.[1];

      const otherMsg = { ...makeSnapshot(99), agentId: 'other-agent' };
      act(() => {
        createdHandler({ message: otherMsg, timestamp: Date.now() });
      });

      expect(result.current.rawMessages).not.toContainEqual(otherMsg);
    });
  });

  // ── EVENT: MESSAGE_UPDATED ────────────────────────────────────────────────

  describe('MESSAGE_UPDATED event', () => {
    /* Preconditions: Hook mounted with 1 message, message becomes hidden
       Action: MESSAGE_UPDATED event with hidden=true
       Assertions: message removed from rawMessages, setMessages called to remove from UIMessages
       Requirements: llm-integration.3.8, llm-integration.8.5 */
    it('should remove hidden message from rawMessages and UIMessages', async () => {
      const snapshot = makeSnapshot(1);
      mockListPaginated.mockResolvedValue({
        success: true,
        data: { messages: [snapshot], hasMore: false },
      });

      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const updatedHandler = mockSubscribe.mock.calls.find(
        ([type]: [string]) => type === EVENT_TYPES.MESSAGE_UPDATED
      )?.[1];

      act(() => {
        updatedHandler({
          message: { ...snapshot, hidden: true },
          timestamp: Date.now(),
        });
      });

      expect(result.current.rawMessages).not.toContainEqual(snapshot);
      // setMessages should have been called to filter out the hidden message
      expect(mockSetMessages).toHaveBeenCalled();
    });

    /* Preconditions: Hook mounted with 1 message, message content updated
       Action: MESSAGE_UPDATED event with hidden=false and new content
       Assertions: rawMessages updated with new snapshot
       Requirements: realtime-events.9.5 */
    it('should update existing message in rawMessages on MESSAGE_UPDATED', async () => {
      const snapshot = makeSnapshot(1);
      mockListPaginated.mockResolvedValue({
        success: true,
        data: { messages: [snapshot], hasMore: false },
      });

      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const updatedHandler = mockSubscribe.mock.calls.find(
        ([type]: [string]) => type === EVENT_TYPES.MESSAGE_UPDATED
      )?.[1];

      const updatedSnapshot = { ...snapshot, payload: { data: { text: 'updated' } } };
      const updatedUI = makeUIMessage(1);
      mockToUIMessage.mockReturnValue(updatedUI);

      act(() => {
        updatedHandler({ message: updatedSnapshot, timestamp: Date.now() });
      });

      expect(result.current.rawMessages).toContainEqual(updatedSnapshot);
    });

    /* Preconditions: Hook mounted, MESSAGE_UPDATED from different agent
       Action: MESSAGE_UPDATED event for other-agent
       Assertions: rawMessages NOT changed
       Requirements: realtime-events.9.5 */
    it('should ignore MESSAGE_UPDATED from other agents', async () => {
      const snapshot = makeSnapshot(1);
      mockListPaginated.mockResolvedValue({
        success: true,
        data: { messages: [snapshot], hasMore: false },
      });

      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const updatedHandler = mockSubscribe.mock.calls.find(
        ([type]: [string]) => type === EVENT_TYPES.MESSAGE_UPDATED
      )?.[1];

      act(() => {
        updatedHandler({
          message: { ...snapshot, agentId: 'other-agent', hidden: true },
          timestamp: Date.now(),
        });
      });

      // rawMessages should still contain the original snapshot
      expect(result.current.rawMessages).toContainEqual(snapshot);
    });
  });
});
