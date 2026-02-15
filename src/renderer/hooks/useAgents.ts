// Requirements: agents.2, agents.3, agents.10, agents.12, error-notifications.2

import { useState, useEffect, useCallback } from 'react';
import { useEventSubscription } from '../events/useEventSubscription';
import { EVENT_TYPES } from '../../shared/events/constants';
import type { Agent } from '../types/agent';
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
  agents: Agent[];
  activeAgent: Agent | null;
  isLoading: boolean;
  createAgent: (name?: string) => Promise<Agent | null>;
  selectAgent: (agentId: string) => void;
  archiveAgent: (agentId: string) => Promise<boolean>;
  refreshAgents: () => Promise<void>;
}

/**
 * Convert event Agent to renderer Agent type
 */
function eventAgentToRendererAgent(eventAgent: AgentCreatedPayload['data']): Agent {
  return {
    agentId: eventAgent.id,
    userId: '', // Not available in event, will be filled from API
    name: eventAgent.name,
    createdAt: new Date(eventAgent.createdAt).toISOString(),
    updatedAt: new Date(eventAgent.updatedAt).toISOString(),
  };
}

/**
 * Hook for managing agents
 * Provides CRUD operations and real-time updates via events
 */
export function useAgents(): UseAgentsResult {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load agents on mount
  // Requirements: agents.2.7, agents.2.8, agents.2.9, agents.2.10, agents.2.11, error-notifications.2
  const loadAgents = useCallback(async () => {
    setIsLoading(true);

    // Requirements: error-notifications.2 - Use callApi for automatic error handling
    const agentList = await callApi<Agent[]>(
      () =>
        window.api.agents.list() as Promise<{ success: boolean; data?: Agent[]; error?: string }>,
      'Loading agents'
    );

    if (agentList) {
      // Requirements: agents.2.7, agents.2.8 - Auto-create first agent for new user
      if (agentList.length === 0) {
        // No agents exist, create first one automatically
        const firstAgent = await callApi<Agent>(
          () =>
            window.api.agents.create('New Agent') as Promise<{
              success: boolean;
              data?: Agent;
              error?: string;
            }>,
          'Creating first agent'
        );

        if (firstAgent) {
          agentList.push(firstAgent);
        }
      }

      // Sort by updatedAt descending (newest first)
      agentList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setAgents(agentList);

      // Select first agent if none selected
      setActiveAgentId((currentId) => {
        if (!currentId && agentList.length > 0) {
          return agentList[0].agentId;
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
  // Requirements: error-notifications.2 - Use callApi for automatic error handling
  const createAgent = useCallback(async (name?: string): Promise<Agent | null> => {
    const newAgent = await callApi<Agent>(
      () =>
        window.api.agents.create(name) as Promise<{
          success: boolean;
          data?: Agent;
          error?: string;
        }>,
      'Creating agent'
    );

    if (newAgent) {
      // Agent will be added via event, but we select it immediately
      setActiveAgentId(newAgent.agentId);
      return newAgent;
    }

    return null;
  }, []);

  // Select agent
  const selectAgent = useCallback((agentId: string) => {
    setActiveAgentId(agentId);
  }, []);

  // Archive agent
  // Requirements: error-notifications.2 - Use callApi for automatic error handling
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
        const remaining = agents.filter((a) => a.agentId !== agentId);
        setActiveAgentId(remaining.length > 0 ? remaining[0].agentId : null);
      }

      // Requirements: agents.2.7, agents.2.8 - Auto-create if archiving last agent
      if (isLastAgent) {
        // Create new agent to maintain invariant
        const newAgent = await callApi<Agent>(
          () =>
            window.api.agents.create('New Agent') as Promise<{
              success: boolean;
              data?: Agent;
              error?: string;
            }>,
          'Creating new agent'
        );

        if (newAgent) {
          setActiveAgentId(newAgent.agentId);
        }
      }

      return true;
    },
    [activeAgentId, agents]
  );

  // Subscribe to agent events
  // Requirements: agents.12.6
  useEventSubscription(EVENT_TYPES.AGENT_CREATED, (payload: AgentCreatedPayload) => {
    if (payload.data) {
      const newAgent = eventAgentToRendererAgent(payload.data);
      setAgents((prev) => {
        // Add to beginning, re-sort
        const updated = [newAgent, ...prev.filter((a) => a.agentId !== newAgent.agentId)];
        updated.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return updated;
      });
    }
  });

  useEventSubscription(EVENT_TYPES.AGENT_UPDATED, (payload: AgentUpdatedPayload) => {
    if (payload.id) {
      setAgents((prev) =>
        prev.map((agent) => {
          if (agent.agentId === payload.id) {
            // Convert event fields to renderer agent fields
            const updates: Partial<Agent> = {};
            if (payload.changedFields.name !== undefined) {
              updates.name = payload.changedFields.name;
            }
            if (payload.changedFields.updatedAt !== undefined) {
              updates.updatedAt = new Date(payload.changedFields.updatedAt).toISOString();
            }
            return { ...agent, ...updates };
          }
          return agent;
        })
      );
    }
  });

  useEventSubscription(EVENT_TYPES.AGENT_ARCHIVED, (payload: AgentArchivedPayload) => {
    if (payload.id) {
      setAgents((prev) => {
        const updated = prev.filter((agent) => agent.agentId !== payload.id);

        // Requirements: agents.2.7, agents.2.9, agents.2.10 - Auto-create if last agent archived
        if (updated.length === 0) {
          // Last agent was archived, create new one to maintain invariant
          // Requirements: error-notifications.2 - Use callApi for automatic error handling
          callApi<Agent>(
            () =>
              window.api.agents.create('New Agent') as Promise<{
                success: boolean;
                data?: Agent;
                error?: string;
              }>,
            'Creating new agent'
          ).then((newAgent) => {
            if (newAgent) {
              setAgents([newAgent]);
              setActiveAgentId(newAgent.agentId);
            }
          });
        }

        return updated;
      });
    }
  });

  // Get active agent object
  const activeAgent = activeAgentId
    ? agents.find((a) => a.agentId === activeAgentId) || null
    : null;

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
