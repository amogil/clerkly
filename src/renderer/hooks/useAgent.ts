// Requirements: realtime-events.9.8, agents.5.6, agents.5.7

import { useState, useEffect } from 'react';
import { useEventSubscription } from '../events/useEventSubscription';
import { EVENT_TYPES } from '../../shared/events/constants';
import type { AgentSnapshot } from '../types/agent';
import type {
  AgentCreatedPayload,
  AgentUpdatedPayload,
  AgentArchivedPayload,
} from '../../shared/events/types';
import { callApi } from '../utils/apiWrapper';

// Access window.api with proper typing
declare const window: Window & {
  api: {
    agents: {
      get: (agentId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    };
  };
};

/**
 * Hook for subscribing to a specific agent
 *
 * Provides:
 * - Initial load via API (with computed status)
 * - Automatic updates via events
 * - Null when agent doesn't exist or is archived
 *
 * Requirements: realtime-events.9.8
 *
 * @param agentId - Agent ID to subscribe to (null = no subscription)
 * @returns AgentSnapshot with computed status, or null
 */
export function useAgent(agentId: string | null): AgentSnapshot | null {
  const [agent, setAgent] = useState<AgentSnapshot | null>(null);

  // Initial load - fetch current state from API
  useEffect(() => {
    if (!agentId) {
      setAgent(null);
      return;
    }

    // Load agent with computed status
    // Requirements: realtime-events.9.8 - API returns snapshot
    callApi<AgentSnapshot>(
      () =>
        window.api.agents.get(agentId) as Promise<{
          success: boolean;
          data?: AgentSnapshot;
          error?: string;
        }>,
      'Loading agent'
    ).then((snapshot) => {
      if (snapshot) {
        setAgent(snapshot);
      }
    });
  }, [agentId]);

  // Live updates - subscribe to AGENT_CREATED
  // (in case agent is created while component is mounted)
  useEventSubscription(EVENT_TYPES.AGENT_CREATED, (payload: AgentCreatedPayload) => {
    if (payload.agent.id === agentId) {
      // Agent was just created - update state
      setAgent(payload.agent);
    }
  });

  // Live updates - subscribe to AGENT_UPDATED
  // Requirements: agents.5.6, agents.5.7 - status and timestamp updates
  useEventSubscription(EVENT_TYPES.AGENT_UPDATED, (payload: AgentUpdatedPayload) => {
    if (payload.agent.id === agentId) {
      // Agent was updated - replace with new snapshot
      // Snapshot already contains computed status
      setAgent(payload.agent);
    }
  });

  // Live updates - subscribe to AGENT_ARCHIVED
  useEventSubscription(EVENT_TYPES.AGENT_ARCHIVED, (payload: AgentArchivedPayload) => {
    if (payload.agent.id === agentId) {
      // Agent was archived - clear state
      setAgent(null);
    }
  });

  return agent;
}

/**
 * Hook for getting only agent status
 *
 * Convenience hook that extracts status from agent snapshot.
 *
 * @param agentId - Agent ID to get status for
 * @returns Agent status or null
 */
export function useAgentStatus(agentId: string | null): AgentSnapshot['status'] | null {
  const agent = useAgent(agentId);
  return agent?.status ?? null;
}
