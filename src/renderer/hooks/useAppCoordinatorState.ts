// Requirements: agents.13.2, navigation.1.1, navigation.1.3

import { useEffect, useState } from 'react';
import { useEventSubscription } from '../events/useEventSubscription';
import { EVENT_TYPES } from '../../shared/events/constants';
import type { AppStateChangedPayload } from '../../shared/events/types';

interface UseAppCoordinatorStateResult {
  state: AppStateChangedPayload | null;
  isBootstrapping: boolean;
}

// Requirements: agents.13.2, navigation.1.1, navigation.1.3
export function useAppCoordinatorState(): UseAppCoordinatorStateResult {
  const [state, setState] = useState<AppStateChangedPayload | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEventSubscription(EVENT_TYPES.APP_STATE_CHANGED, (payload: AppStateChangedPayload) => {
    setState(payload);
    setIsBootstrapping(false);
  });

  useEffect(() => {
    let cancelled = false;

    const loadInitialState = async () => {
      try {
        const initialState = await window.api.app.getState();
        if (!cancelled) {
          setState({
            ...initialState,
            timestamp: Date.now(),
          });
          setIsBootstrapping(false);
        }
      } catch {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    loadInitialState();

    return () => {
      cancelled = true;
    };
  }, []);

  return { state, isBootstrapping };
}
