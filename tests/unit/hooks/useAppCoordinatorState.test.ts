/**
 * @jest-environment jsdom
 */

/* Preconditions: useAppCoordinatorState hook with mocked app IPC polling
   Action: load initial state and continue polling app:get-state
   Assertions: returns correct state and bootstrapping flags
   Requirements: agents.13.2, navigation.1.1, navigation.1.3 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useAppCoordinatorState } from '../../../src/renderer/hooks/useAppCoordinatorState';

describe('useAppCoordinatorState', () => {
  let mockGetState: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetState = jest.fn();

    (window as any).api = {
      app: {
        getState: mockGetState,
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

  /* Preconditions: initial IPC state is already terminal (ready)
     Action: mount hook and advance polling timers
     Assertions: hook does not continue polling after terminal phase
     Requirements: agents.13.13 */
  it('should stop bootstrap polling when initial state is terminal', async () => {
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
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockGetState).toHaveBeenCalledTimes(1);
  });
});
