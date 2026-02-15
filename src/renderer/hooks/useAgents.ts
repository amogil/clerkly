// Requirements: agents.2, agents.3, agents.10, agents.12

import { useState, useEffect, useCallback } from 'react';
import { useEventSubscription } from '../events/useEventSubscription';
import { EVENT_TYPES } from '../../shared/events/constants';
import type { Agent } from '../types/agent';
import type {
  AgentCreatedPayload,
  AgentUpdatedPayload,
  AgentArchivedPayload,
} from '../../shared/events/types';

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
  error: string | null;
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
  const [error, setError] = useState<string | null>(null);

  // Load agents on mount
  const loadAgents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await window.api.agents.list();
      if (result.success && result.data) {
        const agentList = result.data as Agent[];
        // Sort by updatedAt descending (newest first)
        agentList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setAgents(agentList);

        // Select first agent if none selected
        if (!activeAgentId && agentList.length > 0) {
          setActiveAgentId(agentList[0].agentId);
        }
      } else {
        setError(result.error || 'Failed to load agents');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setIsLoading(false);
    }
  }, [activeAgentId]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Create new agent
  const createAgent = useCallback(async (name?: string): Promise<Agent | null> => {
    try {
      const result = await window.api.agents.create(name);
      if (result.success && result.data) {
        const newAgent = result.data as Agent;
        // Agent will be added via event, but we select it immediately
        setActiveAgentId(newAgent.agentId);
        return newAgent;
      }
      setError(result.error || 'Failed to create agent');
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
      return null;
    }
  }, []);

  // Select agent
  const selectAgent = useCallback((agentId: string) => {
    setActiveAgentId(agentId);
  }, []);

  // Archive agent
  const archiveAgent = useCallback(
    async (agentId: string): Promise<boolean> => {
      try {
        const result = await window.api.agents.archive(agentId);
        if (result.success) {
          // If archived agent was active, select next one
          if (activeAgentId === agentId) {
            const remaining = agents.filter((a) => a.agentId !== agentId);
            setActiveAgentId(remaining.length > 0 ? remaining[0].agentId : null);
          }
          return true;
        }
        setError(result.error || 'Failed to archive agent');
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to archive agent');
        return false;
      }
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
      setAgents((prev) => prev.filter((agent) => agent.agentId !== payload.id));
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
    error,
    createAgent,
    selectAgent,
    archiveAgent,
    refreshAgents: loadAgents,
  };
}
