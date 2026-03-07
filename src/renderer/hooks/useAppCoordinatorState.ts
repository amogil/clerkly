// Requirements: agents.13.2, agents.13.16, agents.13.17, navigation.1.1, navigation.1.3

import { useCallback, useEffect, useState } from 'react';
import { EVENT_TYPES } from '../../shared/events/constants';
import type { AppCoordinatorState } from '../../shared/events/types';

const APP_STATE_POLL_INTERVAL_MS = 200;
const BOOTSTRAP_RESYNC_TIMEOUT_MS = 20000;
const STARTUP_TERMINAL_PHASES = new Set(['ready', 'unauthenticated', 'error']);

function normalizeState(payload: AppCoordinatorState): AppCoordinatorState {
  return {
    ...payload,
  };
}

function hasMeaningfulDiff(a: AppCoordinatorState | null, b: AppCoordinatorState): boolean {
  if (!a) return true;
  return (
    a.phase !== b.phase ||
    a.authorized !== b.authorized ||
    a.targetScreen !== b.targetScreen ||
    a.reason !== b.reason
  );
}

interface UseAppCoordinatorStateResult {
  state: AppCoordinatorState | null;
  isBootstrapping: boolean;
}

// Requirements: agents.13.2, agents.13.16, agents.13.17, navigation.1.1, navigation.1.3
export function useAppCoordinatorState(): UseAppCoordinatorStateResult {
  const [state, setState] = useState<AppCoordinatorState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const applyState = useCallback((nextState: AppCoordinatorState) => {
    setState((previousState) => {
      if (!hasMeaningfulDiff(previousState, nextState)) return previousState;
      return nextState;
    });
    setIsBootstrapping(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startupStartedAt = Date.now();
    let startupCompletedViaPolling = false;

    const stopStartupPolling = () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const syncState = async (source: 'ipc:initial' | 'ipc:poll') => {
      if (cancelled) return;

      try {
        const elapsedMs = Date.now() - startupStartedAt;
        if (source === 'ipc:poll' && elapsedMs > BOOTSTRAP_RESYNC_TIMEOUT_MS) {
          stopStartupPolling();
          return;
        }

        const nextState = normalizeState(await window.api.app.getState());

        if (!cancelled) {
          applyState(nextState);
          if (STARTUP_TERMINAL_PHASES.has(nextState.phase)) {
            startupCompletedViaPolling = true;
            stopStartupPolling();
          }
        }
      } catch {
        if (!cancelled && source === 'ipc:initial') {
          setIsBootstrapping(false);
        }
        // Ignore transient IPC errors.
      }
    };

    syncState('ipc:initial');
    intervalId = setInterval(() => {
      syncState('ipc:poll');
    }, APP_STATE_POLL_INTERVAL_MS);

    const unsubscribeAppState = window.api.events?.onEvent((type, payload) => {
      if (type !== EVENT_TYPES.APP_COORDINATOR_STATE_CHANGED) return;
      if (!payload || typeof payload !== 'object' || !('state' in payload)) return;

      // Startup orchestration must be driven by app:get-state polling.
      // EventBus state sync is applied only after startup polling reaches terminal phase.
      if (!startupCompletedViaPolling) return;

      const nextState = normalizeState((payload as { state: AppCoordinatorState }).state);
      applyState(nextState);
    });

    return () => {
      cancelled = true;
      stopStartupPolling();
      unsubscribeAppState?.();
    };
  }, [applyState]);

  return { state, isBootstrapping };
}
