// Requirements: agents.13.2, agents.13.16, navigation.1.1, navigation.1.3

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppStateChangedPayload } from '../../shared/events/types';
const APP_STATE_POLL_INTERVAL_MS = 200;
const BOOTSTRAP_RESYNC_TIMEOUT_MS = 20000;
const TERMINAL_PHASES = new Set(['ready', 'unauthenticated', 'error']);

function normalizeState(
  payload: Omit<AppStateChangedPayload, 'timestamp'>
): AppStateChangedPayload {
  return {
    ...payload,
    timestamp: Date.now(),
  };
}

function hasMeaningfulDiff(a: AppStateChangedPayload | null, b: AppStateChangedPayload): boolean {
  if (!a) return true;
  return (
    a.phase !== b.phase ||
    a.authorized !== b.authorized ||
    a.targetScreen !== b.targetScreen ||
    a.reason !== b.reason
  );
}

interface UseAppCoordinatorStateResult {
  state: AppStateChangedPayload | null;
  isBootstrapping: boolean;
}

// Requirements: agents.13.2, agents.13.16, navigation.1.1, navigation.1.3
export function useAppCoordinatorState(): UseAppCoordinatorStateResult {
  const [state, setState] = useState<AppStateChangedPayload | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const mountStartedAtRef = useRef(Date.now());

  const applyState = useCallback((nextState: AppStateChangedPayload) => {
    setState((previousState) => {
      if (!hasMeaningfulDiff(previousState, nextState)) return previousState;
      return nextState;
    });
    setIsBootstrapping(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const syncState = async (source: 'ipc:initial' | 'ipc:poll') => {
      if (cancelled) return;

      const elapsedMs = Date.now() - mountStartedAtRef.current;
      if (elapsedMs > BOOTSTRAP_RESYNC_TIMEOUT_MS) {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        return;
      }

      try {
        const nextState = normalizeState(await window.api.app.getState());
        if (!cancelled) {
          applyState(nextState);
          if (TERMINAL_PHASES.has(nextState.phase) && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
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

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [applyState]);

  return { state, isBootstrapping };
}
