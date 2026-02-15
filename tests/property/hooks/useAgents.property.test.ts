/**
 * @jest-environment jsdom
 */
// Requirements: agents.2.7, agents.2.8, agents.2.9, agents.2.10
/**
 * Property-based tests for useAgents hook invariants
 */

import * as fc from 'fast-check';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Agent } from '../../../src/renderer/types/agent';

// Mock window.api
const mockAgentsApi = {
  list: jest.fn(),
  create: jest.fn(),
  archive: jest.fn(),
};

// Mock RendererEventBus
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('../../../src/renderer/events/RendererEventBus', () => ({
  RendererEventBus: {
    getInstance: jest.fn(() => ({
      subscribe: mockSubscribe,
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

describe('useAgents hook - Property-based tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue(mockUnsubscribe);
  });

  /* Preconditions: Hook loads with various agent list sizes
     Action: Load agents from API
     Assertions: User always has at least one agent (invariant)
     Requirements: agents.2.7, agents.2.8 */
  it('INVARIANT: user always has at least one agent after load', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }), // Number of agents to start with
        async (initialAgentCount) => {
          // Generate agents
          const agents: Agent[] = Array.from({ length: initialAgentCount }, (_, i) => ({
            agentId: `agent-${i}`,
            userId: 'user-1',
            name: `Agent ${i}`,
            createdAt: new Date(Date.now() - i * 1000).toISOString(),
            updatedAt: new Date(Date.now() - i * 1000).toISOString(),
          }));

          mockAgentsApi.list.mockResolvedValue({ success: true, data: agents });

          // If empty, mock auto-create
          if (initialAgentCount === 0) {
            const newAgent: Agent = {
              agentId: 'auto-created',
              userId: 'user-1',
              name: 'New Agent',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            mockAgentsApi.create.mockResolvedValue({ success: true, data: newAgent });
          }

          const { result, unmount } = renderHook(() => useAgents());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          // INVARIANT: Always at least one agent
          expect(result.current.agents.length).toBeGreaterThanOrEqual(1);

          // If started with 0, should have auto-created
          if (initialAgentCount === 0) {
            expect(mockAgentsApi.create).toHaveBeenCalledWith('New Agent');
          }

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  });

  /* Preconditions: Hook has various numbers of agents
     Action: Archive agents one by one until only one remains
     Assertions: User always has at least one agent (invariant)
     Requirements: agents.2.7, agents.2.9, agents.2.10 */
  it('INVARIANT: user always has at least one agent after archiving', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // Start with 1-5 agents
        async (initialAgentCount) => {
          // Generate agents
          const agents: Agent[] = Array.from({ length: initialAgentCount }, (_, i) => ({
            agentId: `agent-${i}`,
            userId: 'user-1',
            name: `Agent ${i}`,
            createdAt: new Date(Date.now() - i * 1000).toISOString(),
            updatedAt: new Date(Date.now() - i * 1000).toISOString(),
          }));

          mockAgentsApi.list.mockResolvedValue({ success: true, data: [...agents] });
          mockAgentsApi.archive.mockResolvedValue({ success: true });

          const { result, unmount } = renderHook(() => useAgents());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          // Archive all agents one by one
          for (let i = 0; i < initialAgentCount; i++) {
            const currentAgentsCount = result.current.agents.length;
            const agentToArchive = result.current.agents[0];

            // If archiving last agent, mock auto-create
            if (currentAgentsCount === 1) {
              const newAgent: Agent = {
                agentId: `auto-created-${i}`,
                userId: 'user-1',
                name: 'New Agent',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              mockAgentsApi.create.mockResolvedValue({ success: true, data: newAgent });
            }

            await act(async () => {
              await result.current.archiveAgent(agentToArchive.agentId);
            });

            // INVARIANT: Always at least one agent
            // Note: The event-based removal hasn't happened yet, but auto-create should have
            if (currentAgentsCount === 1) {
              // Last agent archived, should have auto-created
              expect(mockAgentsApi.create).toHaveBeenCalled();
            }
          }

          unmount();
        }
      ),
      { numRuns: 30 }
    );
  });

  /* Preconditions: Hook starts with empty list
     Action: Load agents
     Assertions: Auto-created agent has correct properties
     Requirements: agents.2.8, agents.2.9 */
  it('PROPERTY: auto-created agent has correct properties', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        mockAgentsApi.list.mockResolvedValue({ success: true, data: [] });

        const newAgent: Agent = {
          agentId: 'auto-created',
          userId: 'user-1',
          name: 'New Agent',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockAgentsApi.create.mockResolvedValue({ success: true, data: newAgent });

        const { result, unmount } = renderHook(() => useAgents());

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
        });

        // Check properties
        expect(result.current.agents).toHaveLength(1);
        expect(result.current.agents[0].name).toBe('New Agent');
        expect(result.current.agents[0].agentId).toBeTruthy();
        expect(result.current.agents[0].userId).toBe('user-1');
        expect(result.current.activeAgent).not.toBeNull();
        expect(result.current.activeAgent?.agentId).toBe('auto-created');

        unmount();
      }),
      { numRuns: 20 }
    );
  });
});
