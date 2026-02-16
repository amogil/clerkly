// Requirements: agents.2, agents.3, agents.10, agents.12, error-notifications.2, realtime-events.9.8

import { useState, useEffect, useCallback } from 'react';
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
      list: () => Promise<{ success: boolean; data?: unknown; error?: string }>;
      create: (name?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
      archive: (agentId: string) => Promise<{ success: boolean; error?: string }>;
    };
  };
};

interface UseAgentsResult {
  agents: AgentSnapshot[];
  activeAgent: AgentSnapshot | null;
  isLoading: boolean;
  createAgent: (name?: string) => Promise<AgentSnapshot | null>;
  selectAgent: (agentId: string) => void;
  archiveAgent: (agentId: string) => Promise<boolean>;
  refreshAgents: () => Promise<void>;
}

/**
 * Sort agents by updatedAt descending (newest first)
 * Requirements: agents.1.3, agents.5.7
 */
function sortByUpdatedAt(agents: AgentSnapshot[]): AgentSnapshot[] {
  return [...agents].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Hook for managing agents list
 * Provides CRUD operations and real-time updates via events
 *
 * Requirements: realtime-events.9.8 - Works with AgentSnapshots
 */
export function useAgents(): UseAgentsResult {
  const [agents, setAgents] = useState<AgentSnapshot[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load agents on mount
  // Requirements: agents.2.7, agents.2.8, agents.2.9, agents.2.10, agents.2.11, error-notifications.2
  const loadAgents = useCallback(async () => {
    setIsLoading(true);

    // Requirements: error-notifications.2, realtime-events.9.8
    // API returns AgentSnapshot[] with computed status
    const agentList = await callApi<AgentSnapshot[]>(
      () =>
        window.api.agents.list() as Promise<{
          success: boolean;
          data?: AgentSnapshot[];
          error?: string;
        }>,
      'Loading agents'
    );

    if (agentList) {
      // Requirements: agents.2.7, agents.2.8 - Auto-create first agent for new user
      if (agentList.length === 0) {
        // No agents exist, create first one automatically
        const firstAgent = await callApi<AgentSnapshot>(
          () =>
            window.api.agents.create('New Agent') as Promise<{
              success: boolean;
              data?: AgentSnapshot;
              error?: string;
            }>,
          'Creating first agent'
        );

        if (firstAgent) {
          agentList.push(firstAgent);
        }
      }

      // Sort by updatedAt descending (newest first)
      const sorted = sortByUpdatedAt(agentList);
      setAgents(sorted);

      // Select first agent if none selected
      setActiveAgentId((currentId) => {
        if (!currentId && sorted.length > 0) {
          return sorted[0].id;
        }
        return currentId;
      });
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Create new agent
  // Requirements: error-notifications.2, realtime-events.9.8
  const createAgent = useCallback(async (name?: string): Promise<AgentSnapshot | null> => {
    const newAgent = await callApi<AgentSnapshot>(
      () =>
        window.api.agents.create(name) as Promise<{
          success: boolean;
          data?: AgentSnapshot;
          error?: string;
        }>,
      'Creating agent'
    );

    if (newAgent) {
      // Agent will be added via event, but we select it immediately
      setActiveAgentId(newAgent.id);
      return newAgent;
    }

    return null;
  }, []);

  // Select agent
  const selectAgent = useCallback((agentId: string) => {
    setActiveAgentId(agentId);
  }, []);

  // Archive agent
  // Requirements: error-notifications.2, realtime-events.9.8
  const archiveAgent = useCallback(
    async (agentId: string): Promise<boolean> => {
      // Requirements: agents.2.9, agents.2.10 - Check if archiving last agent
      const isLastAgent = agents.length === 1;

      // For void operations, we use a marker object to distinguish success from error
      const result = await callApi<Record<string, never>>(
        () =>
          window.api.agents.archive(agentId).then((r) => ({
            ...r,
            data: r.success ? ({} as Record<string, never>) : undefined,
          })),
        'Archiving agent'
      );

      // If callApi returns null, it means there was an error (toast already shown)
      if (result === null) {
        return false;
      }

      // Success - update local state
      // If archived agent was active, select next one
      if (activeAgentId === agentId) {
        const remaining = agents.filter((a) => a.id !== agentId);
        setActiveAgentId(remaining.length > 0 ? remaining[0].id : null);
      }

      // Requirements: agents.2.7, agents.2.8 - Auto-create if archiving last agent
      if (isLastAgent) {
        // Create new agent to maintain auto-create first agent rule
        const newAgent = await callApi<AgentSnapshot>(
          () =>
            window.api.agents.create('New Agent') as Promise<{
              success: boolean;
              data?: AgentSnapshot;
              error?: string;
            }>,
          'Creating new agent'
        );

        if (newAgent) {
          setActiveAgentId(newAgent.id);
        }
      }

      return true;
    },
    [activeAgentId, agents]
  );

  // Subscribe to agent events
  // Requirements: agents.12.6, realtime-events.9.8, error-notifications.2
  useEventSubscription(EVENT_TYPES.AGENT_CREATED, (payload: AgentCreatedPayload) => {
    try {
      // Snapshot already contains all data including computed status
      const newAgent = payload.agent;
      // Validate before using
      if (!newAgent || !newAgent.id) {
        throw new Error('Missing agent data in AGENT_CREATED event');
      }
      setAgents((prev) => {
        // Add to list, remove duplicates, re-sort
        const updated = [newAgent, ...prev.filter((a) => a.id !== newAgent.id)];
        return sortByUpdatedAt(updated);
      });
    } catch (error) {
      const { toast } = require('sonner');
      toast.error(
        `Invalid AGENT_CREATED event: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  useEventSubscription(EVENT_TYPES.AGENT_UPDATED, (payload: AgentUpdatedPayload) => {
    try {
      // Snapshot already contains all updated data including computed status
      const updatedAgent = payload.agent;
      // Validate before using
      if (!updatedAgent || !updatedAgent.id) {
        throw new Error('Missing agent data in AGENT_UPDATED event');
      }
      setAgents((prev) => {
        // Replace agent with new snapshot, re-sort
        const updated = prev.map((agent) => (agent.id === updatedAgent.id ? updatedAgent : agent));

        // Requirements: agents.1.3, agents.5.7 - Re-sort by updatedAt after update
        // This ensures agents move to the top when they receive new messages
        return sortByUpdatedAt(updated);
      });
    } catch (error) {
      const { toast } = require('sonner');
      toast.error(
        `Invalid AGENT_UPDATED event: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  useEventSubscription(EVENT_TYPES.AGENT_ARCHIVED, (payload: AgentArchivedPayload) => {
    try {
      // Validate before using
      if (!payload.agent || !payload.agent.id) {
        throw new Error('Missing agent data in AGENT_ARCHIVED event');
      }
      const archivedAgentId = payload.agent.id;
      setAgents((prev) => {
        const updated = prev.filter((agent) => agent.id !== archivedAgentId);

        // Requirements: agents.2.7, agents.2.9, agents.2.10 - Auto-create if last agent archived
        if (updated.length === 0) {
          // Last agent was archived, create new one to maintain invariant
          // Requirements: error-notifications.2, realtime-events.9.8
          callApi<AgentSnapshot>(
            () =>
              window.api.agents.create('New Agent') as Promise<{
                success: boolean;
                data?: AgentSnapshot;
                error?: string;
              }>,
            'Creating new agent'
          ).then((newAgent) => {
            if (newAgent) {
              setAgents([newAgent]);
              setActiveAgentId(newAgent.id);
            }
          });
        }

        return updated;
      });
    } catch (error) {
      const { toast } = require('sonner');
      toast.error(
        `Invalid AGENT_ARCHIVED event: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Get active agent object
  const activeAgent = activeAgentId ? agents.find((a) => a.id === activeAgentId) || null : null;

  return {
    agents,
    activeAgent,
    isLoading,
    createAgent,
    selectAgent,
    archiveAgent,
    refreshAgents: loadAgents,
  };
}
