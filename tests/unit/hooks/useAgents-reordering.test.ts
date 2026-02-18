/**
 * @jest-environment jsdom
 */
// Requirements: agents.1.4.1, agents.1.4.2, agents.1.4.3, agents.1.4.4
/**
 * Unit tests for useAgents hook - Agent reordering behavior
 *
 * This test suite verifies that:
 * 1. Agents do NOT reorder on initial load (no "jumping" animation)
 * 2. Agents DO reorder when updatedAt changes via AGENT_UPDATED event
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { EVENT_TYPES } from '../../../src/shared/events/constants';
import type { AgentSnapshot } from '../../../src/renderer/types/agent';
import type { AgentUpdatedPayload } from '../../../src/shared/events/types';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
  },
}));

// Mock window.api
const mockAgentsApi = {
  list: jest.fn(),
  create: jest.fn(),
  archive: jest.fn(),
};

// Mock RendererEventBus
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();
const eventHandlers = new Map<string, (payload: any) => void>();

jest.mock('../../../src/renderer/events/RendererEventBus', () => ({
  RendererEventBus: {
    getInstance: jest.fn(() => ({
      subscribe: (eventType: string, handler: (payload: any) => void) => {
        eventHandlers.set(eventType, handler);
        return mockUnsubscribe;
      },
      subscribeAll: jest.fn(),
      publish: jest.fn(),
    })),
  },
}));

// Set up window.api
(window as any).api = {
  agents: mockAgentsApi,
};

// Import hook after mocks are set up
import { useAgents } from '../../../src/renderer/hooks/useAgents';

describe('useAgents hook - Agent reordering behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eventHandlers.clear();
    mockSubscribe.mockReturnValue(mockUnsubscribe);
    mockAgentsApi.create.mockResolvedValue({ success: true, data: {} });
    mockAgentsApi.archive.mockResolvedValue({ success: true });
  });

  /* Preconditions: Three agents exist with different updatedAt timestamps
     Action: Hook loads agents on mount
     Assertions: 
       - Agents are sorted by updatedAt DESC (newest first)
       - Order remains stable (no reordering triggered)
       - Agent order matches initial API response order
     Requirements: agents.1.3, agents.1.4.1 */
  it('should NOT reorder agents on initial load - agents already sorted', async () => {
    // Create agents with specific updatedAt order
    const mockAgents: AgentSnapshot[] = [
      {
        id: 'agent-1',
        name: 'Agent 1',
        createdAt: new Date('2024-01-01T10:00:00Z').getTime(),
        updatedAt: new Date('2024-01-03T10:00:00Z').getTime(), // Newest
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-2',
        name: 'Agent 2',
        createdAt: new Date('2024-01-01T09:00:00Z').getTime(),
        updatedAt: new Date('2024-01-02T10:00:00Z').getTime(), // Middle
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-3',
        name: 'Agent 3',
        createdAt: new Date('2024-01-01T08:00:00Z').getTime(),
        updatedAt: new Date('2024-01-01T10:00:00Z').getTime(), // Oldest
        archivedAt: null,
        status: 'new',
      },
    ];

    // API returns agents already sorted by updatedAt DESC
    mockAgentsApi.list.mockResolvedValue({ success: true, data: [...mockAgents] });

    // Track order changes
    const orderSnapshots: string[][] = [];

    const { result } = renderHook(() => useAgents());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Capture initial order
    orderSnapshots.push(result.current.agents.map((a) => a.id));

    // Wait a bit to ensure no reordering happens
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Capture order after delay
    orderSnapshots.push(result.current.agents.map((a) => a.id));

    // Verify agents are in correct order (newest first)
    expect(result.current.agents[0]!.id).toBe('agent-1'); // Newest
    expect(result.current.agents[1]!.id).toBe('agent-2'); // Middle
    expect(result.current.agents[2]!.id).toBe('agent-3'); // Oldest

    // Verify order remained stable (no reordering)
    expect(orderSnapshots[0]).toEqual(orderSnapshots[1]);
    expect(orderSnapshots[0]).toEqual(['agent-1', 'agent-2', 'agent-3']);
  });

  /* Preconditions: Three agents loaded, agent-3 is at position 2 (oldest)
     Action: AGENT_UPDATED event updates agent-3's updatedAt to newest timestamp
     Assertions:
       - Agent-3 moves to position 0 (first)
       - Other agents shift down
       - Order changes from [agent-1, agent-2, agent-3] to [agent-3, agent-1, agent-2]
     Requirements: agents.1.4.1, agents.1.4.2, agents.12.6 */
  it('should reorder agents when updatedAt changes via AGENT_UPDATED event', async () => {
    // Create agents with specific updatedAt order
    const mockAgents: AgentSnapshot[] = [
      {
        id: 'agent-1',
        name: 'Agent 1',
        createdAt: new Date('2024-01-01T10:00:00Z').getTime(),
        updatedAt: new Date('2024-01-03T10:00:00Z').getTime(), // Newest initially
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-2',
        name: 'Agent 2',
        createdAt: new Date('2024-01-01T09:00:00Z').getTime(),
        updatedAt: new Date('2024-01-02T10:00:00Z').getTime(), // Middle
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-3',
        name: 'Agent 3',
        createdAt: new Date('2024-01-01T08:00:00Z').getTime(),
        updatedAt: new Date('2024-01-01T10:00:00Z').getTime(), // Oldest initially
        archivedAt: null,
        status: 'new',
      },
    ];

    mockAgentsApi.list.mockResolvedValue({ success: true, data: [...mockAgents] });

    const { result } = renderHook(() => useAgents());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify initial order
    expect(result.current.agents.map((a) => a.id)).toEqual(['agent-1', 'agent-2', 'agent-3']);

    // Simulate AGENT_UPDATED event - agent-3 gets new message, updatedAt changes
    const updatedAgent: AgentSnapshot = {
      ...mockAgents[2]!,
      updatedAt: new Date('2024-01-04T10:00:00Z').getTime(), // Now newest
    };

    const updatePayload: AgentUpdatedPayload = {
      agent: updatedAgent,
      timestamp: Date.now(),
    };

    // Trigger AGENT_UPDATED event
    await act(async () => {
      const handler = eventHandlers.get(EVENT_TYPES.AGENT_UPDATED);
      if (handler) {
        handler(updatePayload);
      }
    });

    // Verify agent-3 moved to position 0 (reordering happened)
    expect(result.current.agents[0]!.id).toBe('agent-3'); // Now first (newest)
    expect(result.current.agents[1]!.id).toBe('agent-1'); // Shifted down
    expect(result.current.agents[2]!.id).toBe('agent-2'); // Shifted down

    // Verify final order
    expect(result.current.agents.map((a) => a.id)).toEqual(['agent-3', 'agent-1', 'agent-2']);
  });

  /* Preconditions: Three agents loaded in order [agent-1, agent-2, agent-3]
     Action: AGENT_UPDATED event updates agent-1's name (no updatedAt change)
     Assertions:
       - Agent name is updated
       - Order remains unchanged [agent-1, agent-2, agent-3]
       - No reordering occurs
     Requirements: agents.1.4.1, agents.12.6 */
  it('should NOT reorder agents when only name changes (updatedAt unchanged)', async () => {
    const mockAgents: AgentSnapshot[] = [
      {
        id: 'agent-1',
        name: 'Agent 1',
        createdAt: new Date('2024-01-01T10:00:00Z').getTime(),
        updatedAt: new Date('2024-01-03T10:00:00Z').getTime(),
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-2',
        name: 'Agent 2',
        createdAt: new Date('2024-01-01T09:00:00Z').getTime(),
        updatedAt: new Date('2024-01-02T10:00:00Z').getTime(),
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-3',
        name: 'Agent 3',
        createdAt: new Date('2024-01-01T08:00:00Z').getTime(),
        updatedAt: new Date('2024-01-01T10:00:00Z').getTime(),
        archivedAt: null,
        status: 'new',
      },
    ];

    mockAgentsApi.list.mockResolvedValue({ success: true, data: [...mockAgents] });

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify initial order
    const initialOrder = result.current.agents.map((a) => a.id);
    expect(initialOrder).toEqual(['agent-1', 'agent-2', 'agent-3']);

    // Simulate AGENT_UPDATED event - only name changes, updatedAt stays same
    const updatedAgent: AgentSnapshot = {
      ...mockAgents[0]!,
      name: 'Agent 1 - Renamed', // Name changed
      // updatedAt unchanged
    };

    const updatePayload: AgentUpdatedPayload = {
      agent: updatedAgent,
      timestamp: Date.now(),
    };

    await act(async () => {
      const handler = eventHandlers.get(EVENT_TYPES.AGENT_UPDATED);
      if (handler) {
        handler(updatePayload);
      }
    });

    // Verify name was updated
    expect(result.current.agents[0]!.name).toBe('Agent 1 - Renamed');

    // Verify order remained unchanged (no reordering)
    const finalOrder = result.current.agents.map((a) => a.id);
    expect(finalOrder).toEqual(initialOrder);
    expect(finalOrder).toEqual(['agent-1', 'agent-2', 'agent-3']);
  });

  /* Preconditions: Three agents loaded, agent-3 at position 2
     Action: Multiple AGENT_UPDATED events in sequence
     Assertions:
       - Each update triggers correct reordering
       - Final order reflects all updates
       - Agents with newer updatedAt are always first
     Requirements: agents.1.4.1, agents.1.4.2, agents.12.6 */
  it('should handle multiple reorderings correctly', async () => {
    const mockAgents: AgentSnapshot[] = [
      {
        id: 'agent-1',
        name: 'Agent 1',
        createdAt: new Date('2024-01-01T10:00:00Z').getTime(),
        updatedAt: new Date('2024-01-03T10:00:00Z').getTime(),
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-2',
        name: 'Agent 2',
        createdAt: new Date('2024-01-01T09:00:00Z').getTime(),
        updatedAt: new Date('2024-01-02T10:00:00Z').getTime(),
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-3',
        name: 'Agent 3',
        createdAt: new Date('2024-01-01T08:00:00Z').getTime(),
        updatedAt: new Date('2024-01-01T10:00:00Z').getTime(),
        archivedAt: null,
        status: 'new',
      },
    ];

    mockAgentsApi.list.mockResolvedValue({ success: true, data: [...mockAgents] });

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Initial order: [agent-1, agent-2, agent-3]
    expect(result.current.agents.map((a) => a.id)).toEqual(['agent-1', 'agent-2', 'agent-3']);

    // Update 1: agent-3 gets newest timestamp
    await act(async () => {
      const handler = eventHandlers.get(EVENT_TYPES.AGENT_UPDATED);
      if (handler) {
        handler({
          agent: {
            ...mockAgents[2]!,
            updatedAt: new Date('2024-01-04T10:00:00Z').getTime(),
          },
          timestamp: Date.now(),
        });
      }
    });

    // Order after update 1: [agent-3, agent-1, agent-2]
    expect(result.current.agents.map((a) => a.id)).toEqual(['agent-3', 'agent-1', 'agent-2']);

    // Update 2: agent-2 gets even newer timestamp
    await act(async () => {
      const handler = eventHandlers.get(EVENT_TYPES.AGENT_UPDATED);
      if (handler) {
        handler({
          agent: {
            ...mockAgents[1]!,
            updatedAt: new Date('2024-01-05T10:00:00Z').getTime(),
          },
          timestamp: Date.now(),
        });
      }
    });

    // Order after update 2: [agent-2, agent-3, agent-1]
    expect(result.current.agents.map((a) => a.id)).toEqual(['agent-2', 'agent-3', 'agent-1']);

    // Update 3: agent-1 gets newest timestamp again
    await act(async () => {
      const handler = eventHandlers.get(EVENT_TYPES.AGENT_UPDATED);
      if (handler) {
        handler({
          agent: {
            ...mockAgents[0]!,
            updatedAt: new Date('2024-01-06T10:00:00Z').getTime(),
          },
          timestamp: Date.now(),
        });
      }
    });

    // Final order: [agent-1, agent-2, agent-3]
    expect(result.current.agents.map((a) => a.id)).toEqual(['agent-1', 'agent-2', 'agent-3']);
  });

  /* Preconditions: Agent at position 2 (hidden from view if visibleCount < 3)
     Action: AGENT_UPDATED event updates hidden agent's updatedAt to newest
     Assertions:
       - Hidden agent moves to position 0 (becomes visible)
       - Agent appears in visible area of header
       - Reordering brings hidden agent to front
     Requirements: agents.1.4.3 */
  it('should bring hidden agent to front when updatedAt changes', async () => {
    // Create 5 agents (assuming visibleCount = 3, agents 4-5 are hidden)
    const mockAgents: AgentSnapshot[] = [
      {
        id: 'agent-1',
        name: 'Agent 1',
        createdAt: new Date('2024-01-01T10:00:00Z').getTime(),
        updatedAt: new Date('2024-01-05T10:00:00Z').getTime(),
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-2',
        name: 'Agent 2',
        createdAt: new Date('2024-01-01T09:00:00Z').getTime(),
        updatedAt: new Date('2024-01-04T10:00:00Z').getTime(),
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-3',
        name: 'Agent 3',
        createdAt: new Date('2024-01-01T08:00:00Z').getTime(),
        updatedAt: new Date('2024-01-03T10:00:00Z').getTime(),
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-4',
        name: 'Agent 4',
        createdAt: new Date('2024-01-01T07:00:00Z').getTime(),
        updatedAt: new Date('2024-01-02T10:00:00Z').getTime(),
        archivedAt: null,
        status: 'new',
      },
      {
        id: 'agent-5',
        name: 'Agent 5',
        createdAt: new Date('2024-01-01T06:00:00Z').getTime(),
        updatedAt: new Date('2024-01-01T10:00:00Z').getTime(),
        archivedAt: null,
        status: 'new',
      },
    ];

    mockAgentsApi.list.mockResolvedValue({ success: true, data: [...mockAgents] });

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Initial order: [agent-1, agent-2, agent-3, agent-4, agent-5]
    expect(result.current.agents.map((a) => a.id)).toEqual([
      'agent-1',
      'agent-2',
      'agent-3',
      'agent-4',
      'agent-5',
    ]);

    // agent-5 is at position 4 (hidden if visibleCount = 3)
    expect(result.current.agents[4]!.id).toBe('agent-5');

    // Update agent-5 to have newest timestamp
    await act(async () => {
      const handler = eventHandlers.get(EVENT_TYPES.AGENT_UPDATED);
      if (handler) {
        handler({
          agent: {
            ...mockAgents[4]!,
            updatedAt: new Date('2024-01-06T10:00:00Z').getTime(), // Newest
          },
          timestamp: Date.now(),
        });
      }
    });

    // agent-5 should now be at position 0 (visible)
    expect(result.current.agents[0]!.id).toBe('agent-5');
    expect(result.current.agents.map((a) => a.id)).toEqual([
      'agent-5',
      'agent-1',
      'agent-2',
      'agent-3',
      'agent-4',
    ]);
  });
});
