/**
 * @jest-environment jsdom
 */
// Requirements: agents.4, agents.7, agents.12, agents.13, llm-integration.2, llm-integration.8, realtime-events.9
// tests/unit/hooks/useAgentChat.test.ts
// Unit tests for useAgentChat hook

import { renderHook, act, waitFor } from '@testing-library/react';
import { Chat } from '@ai-sdk/react';
import { EVENT_TYPES } from '../../../src/shared/events/constants';
import type { MessageSnapshot } from '../../../src/shared/events/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock @ai-sdk/react useChat + Chat
const mockSetMessages = jest.fn();
const mockChatSendMessage = jest.fn().mockResolvedValue(undefined);
const mockChatStop = jest.fn();
const mockStatus = { current: 'ready' as string };

jest.mock('@ai-sdk/react', () => {
  const Chat = jest.fn().mockImplementation(() => ({ id: 'mock-chat' }));
  const useChat = jest.fn().mockImplementation(() => ({
    messages: [],
    setMessages: mockSetMessages,
    sendMessage: mockChatSendMessage,
    stop: mockChatStop,
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
jest.mock('../../../src/renderer/lib/messageMapper', () => ({
  toUIMessages: (...args: unknown[]) => mockToUIMessages(...args),
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
const mockList = jest.fn();
const mockCancel = jest.fn();
(window as unknown as { api: unknown }).api = {
  messages: {
    list: mockList,
    cancel: mockCancel,
  },
};

// Import hook after mocks
import { useAgentChat } from '../../../src/renderer/hooks/useAgentChat';

// ── Fixtures ───────────────────────────────────────────────────────────────

const makeSnapshot = (
  id: number,
  kind = 'user',
  hidden = false,
  order?: { runId: string; attemptId: number; sequence: number }
): MessageSnapshot => ({
  id,
  agentId: 'agent-1',
  kind,
  timestamp: Date.now(),
  replyToMessageId: null,
  payload: { data: { text: `msg ${id}`, order } },
  hidden,
  done: true,
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
    mockChatStop.mockReset();
    mockCancel.mockReset();
    mockCancel.mockResolvedValue({ success: true });

    // Default: empty history
    mockList.mockResolvedValue({
      success: true,
      data: [],
    });
    mockToUIMessages.mockReturnValue([]);
    // Reset setMessages mock to track calls
    mockSetMessages.mockReset();
  });

  // ── Initial load ─────────────────────────────────────────────────────────

  describe('initial load', () => {
    /* Preconditions: agentId provided, API returns 2 messages
       Action: Hook mounts
       Assertions: list called with agentId, rawMessages set
       Requirements: agents.13.1, agents.13.2, agents.13.8 */
    it('should load initial messages on mount', async () => {
      const snapshots = [makeSnapshot(1), makeSnapshot(2)];
      const uiMessages = [makeUIMessage(1), makeUIMessage(2)];
      mockList.mockResolvedValue({
        success: true,
        data: snapshots,
      });
      mockToUIMessages.mockReturnValue(uiMessages);

      const { result } = renderHook(() => useAgentChat('agent-1'));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockList).toHaveBeenCalledWith('agent-1');
      expect(result.current.rawMessages).toEqual(snapshots);
    });

    /* Preconditions: agentId is null
       Action: Hook mounts
       Assertions: No API call, empty state
       Requirements: agents.13.1 */
    it('should not load when agentId is null', async () => {
      const { result } = renderHook(() => useAgentChat(null));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockList).not.toHaveBeenCalled();
      expect(result.current.rawMessages).toEqual([]);
    });

    /* Preconditions: agentId provided
       Action: Hook mounts
       Assertions: Chat lifecycle hooks onFinish/onError are configured
       Requirements: llm-integration.2.8 */
    it('should configure useChat lifecycle hooks in Chat instance', async () => {
      renderHook(() => useAgentChat('agent-1'));

      await waitFor(() => expect(mockList).toHaveBeenCalledWith('agent-1'));

      const firstCall = (Chat as unknown as jest.Mock).mock.calls[0]?.[0] as
        | { onFinish?: unknown; onError?: unknown }
        | undefined;
      expect(typeof firstCall?.onFinish).toBe('function');
      expect(typeof firstCall?.onError).toBe('function');
    });

    /* Preconditions: agentId provided, API returns success:false
       Action: Hook mounts
       Assertions: rawMessages stays empty, no crash
       Requirements: agents.13.1 */
    it('should handle API failure gracefully', async () => {
      mockList.mockResolvedValue({ success: false, error: 'DB error' });

      const { result } = renderHook(() => useAgentChat('agent-1'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.rawMessages).toEqual([]);
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

  describe('cancelCurrentRequest', () => {
    /* Preconditions: agentId set, cancel endpoint returns success
       Action: cancelCurrentRequest() called
       Assertions: chat stop called, cancel IPC called, returns true
       Requirements: llm-integration.8.1, llm-integration.8.7 */
    it('should stop streaming and cancel active request', async () => {
      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.cancelCurrentRequest();
      });

      expect(mockChatStop).toHaveBeenCalled();
      expect(mockCancel).toHaveBeenCalledWith('agent-1');
      expect(success).toBe(true);
    });

    /* Preconditions: agentId is null
       Action: cancelCurrentRequest() called
       Assertions: returns false and no side effects
       Requirements: llm-integration.8.1 */
    it('should return false when agentId is null', async () => {
      const { result } = renderHook(() => useAgentChat(null));

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.cancelCurrentRequest();
      });

      expect(mockChatStop).not.toHaveBeenCalled();
      expect(mockCancel).not.toHaveBeenCalled();
      expect(success).toBe(false);
    });

    /* Preconditions: agentId set, cancel endpoint throws
       Action: cancelCurrentRequest() called
       Assertions: returns false
       Requirements: llm-integration.8.7 */
    it('should return false when cancel endpoint fails', async () => {
      mockCancel.mockRejectedValueOnce(new Error('IPC error'));

      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.cancelCurrentRequest();
      });

      expect(mockChatStop).toHaveBeenCalled();
      expect(success).toBe(false);
    });

    /* Preconditions: agentId set, cancel endpoint returns success:false
       Action: cancelCurrentRequest() called
       Assertions: returns false without throwing
       Requirements: agents.4.24.3 */
    it('should return false when cancel endpoint returns unsuccessful result', async () => {
      mockCancel.mockResolvedValueOnce({ success: false, error: 'cancel failed' });

      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.cancelCurrentRequest();
      });

      expect(mockChatStop).toHaveBeenCalled();
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

    /* Preconditions: Hook mounted, messages from one run/attempt arrive out of sequence
       Action: MESSAGE_CREATED emitted in order sequence 2 then 1
       Assertions: rawMessages are sorted by payload.data.order.sequence
       Requirements: agents.7.4.8 */
    it('should sort MESSAGE_CREATED snapshots by sequence within one run attempt', async () => {
      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const createdHandler = mockSubscribe.mock.calls.find(
        ([type]: [string]) => type === EVENT_TYPES.MESSAGE_CREATED
      )?.[1];
      expect(createdHandler).toBeDefined();

      const seq2 = makeSnapshot(102, 'llm', false, {
        runId: 'run-1',
        attemptId: 1,
        sequence: 2,
      });
      const seq1 = makeSnapshot(101, 'llm', false, {
        runId: 'run-1',
        attemptId: 1,
        sequence: 1,
      });

      act(() => {
        createdHandler({ message: seq2, timestamp: Date.now() });
        createdHandler({ message: seq1, timestamp: Date.now() });
      });

      expect(result.current.rawMessages.map((m) => m.id)).toEqual([101, 102]);
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
       Assertions: message removed from rawMessages without extra setMessages synchronization
       Requirements: llm-integration.3.8, llm-integration.8.5 */
    it('should remove hidden message from rawMessages without syncing UIMessages', async () => {
      const snapshot = makeSnapshot(1);
      mockList.mockResolvedValue({
        success: true,
        data: [snapshot],
      });

      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const setMessagesCallsBeforeUpdate = mockSetMessages.mock.calls.length;

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
      expect(mockSetMessages.mock.calls.length).toBe(setMessagesCallsBeforeUpdate);
    });

    /* Preconditions: Hook mounted with 1 message, message content updated
       Action: MESSAGE_UPDATED event with hidden=false and new content
       Assertions: rawMessages updated with new snapshot
       Requirements: realtime-events.9.5 */
    it('should update existing message in rawMessages on MESSAGE_UPDATED', async () => {
      const snapshot = makeSnapshot(1);
      mockList.mockResolvedValue({
        success: true,
        data: [snapshot],
      });

      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const setMessagesCallsBeforeUpdate = mockSetMessages.mock.calls.length;

      const updatedHandler = mockSubscribe.mock.calls.find(
        ([type]: [string]) => type === EVENT_TYPES.MESSAGE_UPDATED
      )?.[1];

      const updatedSnapshot = { ...snapshot, payload: { data: { text: 'updated' } } };
      act(() => {
        updatedHandler({ message: updatedSnapshot, timestamp: Date.now() });
      });

      expect(result.current.rawMessages).toContainEqual(updatedSnapshot);
      expect(mockSetMessages.mock.calls.length).toBe(setMessagesCallsBeforeUpdate);
    });

    /* Preconditions: Hook mounted with empty history, updated event arrives before created
       Action: MESSAGE_UPDATED event with hidden=false
       Assertions: message is added to rawMessages (upsert behavior)
       Requirements: realtime-events.9.5 */
    it('should upsert message into rawMessages when MESSAGE_UPDATED arrives before MESSAGE_CREATED', async () => {
      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const updatedHandler = mockSubscribe.mock.calls.find(
        ([type]: [string]) => type === EVENT_TYPES.MESSAGE_UPDATED
      )?.[1];

      const updatedSnapshot = makeSnapshot(404, 'tool_call');

      act(() => {
        updatedHandler({ message: updatedSnapshot, timestamp: Date.now() });
      });

      expect(result.current.rawMessages).toContainEqual(updatedSnapshot);
    });

    /* Preconditions: Hook mounted, two updates for same run/attempt arrive in reverse sequence
       Action: MESSAGE_UPDATED events for sequence 2 then 1
       Assertions: rawMessages order follows payload.data.order.sequence
       Requirements: agents.7.4.8 */
    it('should sort MESSAGE_UPDATED snapshots by sequence within one run attempt', async () => {
      const { result } = renderHook(() => useAgentChat('agent-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const updatedHandler = mockSubscribe.mock.calls.find(
        ([type]: [string]) => type === EVENT_TYPES.MESSAGE_UPDATED
      )?.[1];

      const seq2 = makeSnapshot(302, 'llm', false, {
        runId: 'run-2',
        attemptId: 1,
        sequence: 2,
      });
      const seq1 = makeSnapshot(301, 'tool_call', false, {
        runId: 'run-2',
        attemptId: 1,
        sequence: 1,
      });

      act(() => {
        updatedHandler({ message: seq2, timestamp: Date.now() });
        updatedHandler({ message: seq1, timestamp: Date.now() });
      });

      expect(result.current.rawMessages.map((m) => m.id)).toEqual([301, 302]);
    });

    /* Preconditions: Hook mounted, MESSAGE_UPDATED from different agent
       Action: MESSAGE_UPDATED event for other-agent
       Assertions: rawMessages NOT changed
       Requirements: realtime-events.9.5 */
    it('should ignore MESSAGE_UPDATED from other agents', async () => {
      const snapshot = makeSnapshot(1);
      mockList.mockResolvedValue({
        success: true,
        data: [snapshot],
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
