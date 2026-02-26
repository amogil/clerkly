/**
 * @jest-environment jsdom
 */

/* Preconditions: useAppCoordinatorState hook with mocked app IPC and event subscription
   Action: load initial state and receive app.state.changed events
   Assertions: returns correct state and bootstrapping flags
   Requirements: agents.13.2, navigation.1.1, navigation.1.3 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { EVENT_TYPES } from '../../../src/shared/events/constants';
import { useAppCoordinatorState } from '../../../src/renderer/hooks/useAppCoordinatorState';
import { useEventSubscription } from '../../../src/renderer/events/useEventSubscription';

jest.mock('../../../src/renderer/events/useEventSubscription', () => ({
  useEventSubscription: jest.fn(),
}));

describe('useAppCoordinatorState', () => {
  const mockedUseEventSubscription = useEventSubscription as jest.MockedFunction<
    typeof useEventSubscription
  >;
  let appStateChangedHandler: ((payload: any) => void) | null = null;
  let mockGetState: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    appStateChangedHandler = null;
    mockGetState = jest.fn();

    (window as any).api = {
      app: {
        getState: mockGetState,
      },
    };

    mockedUseEventSubscription.mockImplementation((type: string, handler: any) => {
      if (type === EVENT_TYPES.APP_STATE_CHANGED) {
        appStateChangedHandler = handler;
      }
    });
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
    expect(mockedUseEventSubscription).toHaveBeenCalledWith(
      EVENT_TYPES.APP_STATE_CHANGED,
      expect.any(Function)
    );

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

  /* Preconditions: hook mounted and app.state.changed event received
     Action: invoke subscribed APP_STATE_CHANGED handler
     Assertions: state updates from event and bootstrapping becomes false
     Requirements: agents.13.2, navigation.1.3 */
  it('should update state from APP_STATE_CHANGED event', async () => {
    mockGetState.mockImplementation(
      () =>
        new Promise(() => {
          // Keep pending to ensure state update comes from event.
        })
    );

    const { result } = renderHook(() => useAppCoordinatorState());
    expect(appStateChangedHandler).toBeTruthy();

    act(() => {
      appStateChangedHandler?.({
        phase: 'unauthenticated',
        authorized: false,
        targetScreen: 'login',
        reason: 'auth_failed',
        timestamp: Date.now(),
      });
    });

    expect(result.current.isBootstrapping).toBe(false);
    expect(result.current.state).toMatchObject({
      phase: 'unauthenticated',
      authorized: false,
      targetScreen: 'login',
      reason: 'auth_failed',
    });
  });
});
