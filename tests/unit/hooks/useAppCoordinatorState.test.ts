/**
 * @jest-environment jsdom
 */

/* Preconditions: useAppCoordinatorState hook with mocked app IPC polling
   Action: load initial state and continue polling app:get-state
   Assertions: returns correct state and bootstrapping flags
   Requirements: agents.13.2, navigation.1.1, navigation.1.3 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useAppCoordinatorState } from '../../../src/renderer/hooks/useAppCoordinatorState';
import { EVENT_TYPES } from '../../../src/shared/events/constants';

describe('useAppCoordinatorState', () => {
  let mockGetState: jest.Mock;
  let mockOnEvent: jest.Mock;
  let eventCallback: ((type: string, payload: unknown) => void) | null;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetState = jest.fn();
    mockOnEvent = jest.fn();
    eventCallback = null;
    mockOnEvent.mockImplementation((callback: (type: string, payload: unknown) => void) => {
      eventCallback = callback;
      return jest.fn();
    });

    (window as any).api = {
      app: {
        getState: mockGetState,
      },
      events: {
        onEvent: mockOnEvent,
      },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /* Preconditions: app:get-state IPC resolves successfully
     Action: mount useAppCoordinatorState
     Assertions: state is populated and bootstrapping becomes false
     Requirements: agents.13.2 */
  it('should load initial state from IPC on mount', async () => {
    mockGetState.mockResolvedValue({
      phase: 'ready',
      authorized: true,
      targetScreen: 'agents',
      reason: 'startup_authorized',
    });

    const { result } = renderHook(() => useAppCoordinatorState());

    expect(result.current.isBootstrapping).toBe(true);

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    expect(result.current.state).toMatchObject({
      phase: 'ready',
      authorized: true,
      targetScreen: 'agents',
      reason: 'startup_authorized',
    });
  });

  /* Preconditions: app:get-state IPC rejects with error
     Action: mount useAppCoordinatorState
     Assertions: bootstrapping ends without state
     Requirements: agents.13.2 */
  it('should finish bootstrapping when initial IPC state fails', async () => {
    mockGetState.mockRejectedValue(new Error('ipc unavailable'));

    const { result } = renderHook(() => useAppCoordinatorState());

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    expect(result.current.state).toBeNull();
  });

  /* Preconditions: initial IPC state is stale booting
     Action: mount hook and advance polling timer
     Assertions: hook recovers state via repeated app:get-state polling
     Requirements: agents.13.13 */
  it('should resync state via IPC polling during bootstrap', async () => {
    mockGetState
      .mockResolvedValueOnce({
        phase: 'booting',
        authorized: false,
        targetScreen: 'login',
        reason: 'startup',
      })
      .mockResolvedValue({
        phase: 'waiting-for-chats',
        authorized: true,
        targetScreen: 'agents',
        reason: 'startup_authorized',
      });

    const { result } = renderHook(() => useAppCoordinatorState());

    await waitFor(() => {
      expect(result.current.state?.phase).toBe('booting');
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        phase: 'waiting-for-chats',
        authorized: true,
        targetScreen: 'agents',
        reason: 'startup_authorized',
      });
    });
    expect(mockGetState).toHaveBeenCalledTimes(2);
  });

  /* Preconditions: initial IPC state is ready (startup terminal)
     Action: mount hook and advance polling timer
     Assertions: hook stops startup polling after terminal phase
     Requirements: agents.13.16 */
  it('should stop startup polling after ready phase', async () => {
    mockGetState.mockResolvedValue({
      phase: 'ready',
      authorized: true,
      targetScreen: 'agents',
      reason: 'chats_ready',
    });

    const { result } = renderHook(() => useAppCoordinatorState());

    await waitFor(() => {
      expect(result.current.state?.phase).toBe('ready');
      expect(result.current.isBootstrapping).toBe(false);
    });
    expect(mockGetState).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(mockGetState).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: initial IPC state is unauthenticated (startup terminal)
     Action: mount hook and advance polling timers
     Assertions: hook stops startup polling after terminal phase
     Requirements: agents.13.16 */
  it('should stop startup polling after unauthenticated phase', async () => {
    mockGetState.mockResolvedValue({
      phase: 'unauthenticated',
      authorized: false,
      targetScreen: 'login',
      reason: 'not_authorized',
    });

    const { result } = renderHook(() => useAppCoordinatorState());

    await waitFor(() => {
      expect(result.current.state?.phase).toBe('unauthenticated');
      expect(result.current.isBootstrapping).toBe(false);
    });
    expect(mockGetState).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(mockGetState).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: startup polling is stopped in ready phase and app coordinator emits runtime event
     Action: emit app.coordinator.state-changed with signed out state
     Assertions: hook updates state from event without additional polling
     Requirements: agents.13.12, navigation.1.4 */
  it('should update state from app coordinator state-changed event after startup', async () => {
    mockGetState.mockResolvedValue({
      phase: 'ready',
      authorized: true,
      targetScreen: 'agents',
      reason: 'chats_ready',
    });

    const { result } = renderHook(() => useAppCoordinatorState());

    await waitFor(() => {
      expect(result.current.state?.phase).toBe('ready');
      expect(result.current.isBootstrapping).toBe(false);
    });
    expect(mockGetState).toHaveBeenCalledTimes(1);

    act(() => {
      eventCallback?.(EVENT_TYPES.APP_COORDINATOR_STATE_CHANGED, {
        state: {
          phase: 'unauthenticated',
          authorized: false,
          targetScreen: 'login',
          reason: 'signed_out',
        },
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        phase: 'unauthenticated',
        authorized: false,
        targetScreen: 'login',
        reason: 'signed_out',
      });
    });
    expect(mockGetState).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: startup state is non-terminal and app coordinator emits terminal state event
     Action: emit app.coordinator.state-changed before polling reaches terminal phase
     Assertions: hook ignores startup event and keeps polling until terminal state is received from IPC
     Requirements: agents.13.16, agents.13.18 */
  it('should ignore app coordinator state-changed events before startup polling completes', async () => {
    mockGetState
      .mockResolvedValueOnce({
        phase: 'waiting-for-chats',
        authorized: true,
        targetScreen: 'agents',
        reason: 'startup_authorized',
      })
      .mockResolvedValue({
        phase: 'ready',
        authorized: true,
        targetScreen: 'agents',
        reason: 'chats_ready_renderer',
      });

    const { result } = renderHook(() => useAppCoordinatorState());

    await waitFor(() => {
      expect(result.current.state?.phase).toBe('waiting-for-chats');
      expect(result.current.isBootstrapping).toBe(false);
    });
    expect(mockGetState).toHaveBeenCalledTimes(1);

    act(() => {
      eventCallback?.(EVENT_TYPES.APP_COORDINATOR_STATE_CHANGED, {
        state: {
          phase: 'ready',
          authorized: true,
          targetScreen: 'agents',
          reason: 'from_event_during_startup',
        },
        timestamp: Date.now(),
      });
    });

    // Event must be ignored until polling itself reaches terminal startup phase.
    expect(result.current.state).toMatchObject({
      phase: 'waiting-for-chats',
      authorized: true,
      targetScreen: 'agents',
      reason: 'startup_authorized',
    });

    await act(async () => {
      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        phase: 'ready',
        authorized: true,
        targetScreen: 'agents',
        reason: 'chats_ready_renderer',
      });
    });
  });

  /* Preconditions: app coordinator event payload is malformed
     Action: emit app.coordinator.state-changed without state
     Assertions: hook ignores malformed payload
     Requirements: agents.13.12 */
  it('should ignore malformed app coordinator state event payload', async () => {
    mockGetState.mockResolvedValue({
      phase: 'ready',
      authorized: true,
      targetScreen: 'agents',
      reason: 'chats_ready',
    });

    const { result } = renderHook(() => useAppCoordinatorState());

    await waitFor(() => {
      expect(result.current.state?.phase).toBe('ready');
    });

    act(() => {
      eventCallback?.(EVENT_TYPES.APP_COORDINATOR_STATE_CHANGED, {
        timestamp: Date.now(),
      } as unknown);
    });

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        phase: 'ready',
        authorized: true,
        targetScreen: 'agents',
      });
    });
  });

  /* Preconditions: startup polling is active
     Action: emit unrelated event type
     Assertions: hook does not alter state for unrelated events
     Requirements: agents.13.12 */
  it('should ignore unrelated event types', async () => {
    mockGetState
      .mockResolvedValueOnce({
        phase: 'waiting-for-chats',
        authorized: true,
        targetScreen: 'agents',
        reason: 'startup_authorized',
      })
      .mockResolvedValue({
        phase: 'waiting-for-chats',
        authorized: true,
        targetScreen: 'agents',
        reason: 'startup_authorized',
      });

    const { result } = renderHook(() => useAppCoordinatorState());

    await waitFor(() => {
      expect(result.current.state?.phase).toBe('waiting-for-chats');
    });

    const callsBefore = mockGetState.mock.calls.length;

    act(() => {
      eventCallback?.(EVENT_TYPES.AUTH_STARTED, { timestamp: Date.now() });
    });

    expect(mockGetState.mock.calls.length).toBe(callsBefore);
  });
});
