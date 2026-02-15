/**
 * @jest-environment jsdom
 */
// Requirements: agents.2, agents.3, agents.10, agents.12
/**
 * Unit tests for useAgents hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { EVENT_TYPES } from '../../../src/shared/events/constants';
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

describe('useAgents hook', () => {
  const mockAgents: Agent[] = [
    {
      agentId: 'agent-1',
      userId: 'user-1',
      name: 'Agent 1',
      createdAt: '2024-01-01T10:00:00Z',
      updatedAt: '2024-01-02T10:00:00Z',
    },
    {
      agentId: 'agent-2',
      userId: 'user-1',
      name: 'Agent 2',
      createdAt: '2024-01-01T09:00:00Z',
      updatedAt: '2024-01-01T09:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue(mockUnsubscribe);
    mockAgentsApi.list.mockResolvedValue({ success: true, data: [...mockAgents] });
    mockAgentsApi.create.mockResolvedValue({ success: true, data: mockAgents[0] });
    mockAgentsApi.archive.mockResolvedValue({ success: true });
  });

  describe('initial load', () => {
    /* Preconditions: Hook mounts
       Action: useAgents is called
       Assertions: Agents are loaded from API
       Requirements: agents.1.3, agents.10.2 */
    it('should load agents on mount', async () => {
      const { result } = renderHook(() => useAgents());

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockAgentsApi.list).toHaveBeenCalled();
      expect(result.current.agents).toHaveLength(2);
    });

    /* Preconditions: Hook mounts with agents
       Action: useAgents is called
       Assertions: Agents are sorted by updatedAt descending
       Requirements: agents.1.3 */
    it('should sort agents by updatedAt descending', async () => {
      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.agents[0].agentId).toBe('agent-1');
      expect(result.current.agents[1].agentId).toBe('agent-2');
    });

    /* Preconditions: Hook mounts with agents
       Action: useAgents is called
       Assertions: First agent is selected as active
       Requirements: agents.3 */
    it('should select first agent as active', async () => {
      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.activeAgent).not.toBeNull();
      expect(result.current.activeAgent?.agentId).toBe('agent-1');
    });

    /* Preconditions: Hook mounts with no agents
       Action: useAgents is called
       Assertions: activeAgent is null
       Requirements: agents.3 */
    it('should have null activeAgent when no agents', async () => {
      mockAgentsApi.list.mockResolvedValue({ success: true, data: [] });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.activeAgent).toBeNull();
    });

    /* Preconditions: API returns error
       Action: useAgents is called
       Assertions: Error is set
       Requirements: agents.10 */
    it('should set error on API failure', async () => {
      mockAgentsApi.list.mockResolvedValue({ success: false, error: 'Network error' });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
    });
  });

  describe('createAgent', () => {
    /* Preconditions: Hook is mounted
       Action: createAgent is called
       Assertions: API is called and new agent is selected
       Requirements: agents.2.3, agents.2.4, agents.2.5 */
    it('should create agent and select it', async () => {
      const newAgent: Agent = {
        agentId: 'agent-new',
        userId: 'user-1',
        name: 'New Agent',
        createdAt: '2024-01-03T10:00:00Z',
        updatedAt: '2024-01-03T10:00:00Z',
      };
      mockAgentsApi.create.mockResolvedValue({ success: true, data: newAgent });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let createdAgent: Agent | null = null;
      await act(async () => {
        createdAgent = await result.current.createAgent('New Agent');
      });

      expect(mockAgentsApi.create).toHaveBeenCalledWith('New Agent');
      expect(createdAgent).toEqual(newAgent);
    });

    /* Preconditions: Hook is mounted
       Action: createAgent fails
       Assertions: Error is set and null is returned
       Requirements: agents.2 */
    it('should set error on create failure', async () => {
      mockAgentsApi.create.mockResolvedValue({ success: false, error: 'Create failed' });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let createdAgent: Agent | null = null;
      await act(async () => {
        createdAgent = await result.current.createAgent();
      });

      expect(createdAgent).toBeNull();
      expect(result.current.error).toBe('Create failed');
    });
  });

  describe('selectAgent', () => {
    /* Preconditions: Hook is mounted with agents
       Action: selectAgent is called
       Assertions: activeAgent changes
       Requirements: agents.3 */
    it('should change active agent', async () => {
      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.activeAgent?.agentId).toBe('agent-1');

      act(() => {
        result.current.selectAgent('agent-2');
      });

      expect(result.current.activeAgent?.agentId).toBe('agent-2');
    });
  });

  describe('archiveAgent', () => {
    /* Preconditions: Hook is mounted with agents
       Action: archiveAgent is called
       Assertions: API is called
       Requirements: agents.10.4 */
    it('should archive agent', async () => {
      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success = false;
      await act(async () => {
        success = await result.current.archiveAgent('agent-2');
      });

      expect(mockAgentsApi.archive).toHaveBeenCalledWith('agent-2');
      expect(success).toBe(true);
    });

    /* Preconditions: Active agent is archived
       Action: archiveAgent is called on active agent
       Assertions: Next agent is selected
       Requirements: agents.10.4 */
    it('should select next agent when active is archived', async () => {
      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.activeAgent?.agentId).toBe('agent-1');

      await act(async () => {
        await result.current.archiveAgent('agent-1');
      });

      // After archive, the hook should select the next available agent
      // Note: The actual removal happens via event, but selection logic runs immediately
      expect(result.current.activeAgent?.agentId).toBe('agent-2');
    });

    /* Preconditions: Hook is mounted
       Action: archiveAgent fails
       Assertions: Error is set
       Requirements: agents.10 */
    it('should set error on archive failure', async () => {
      mockAgentsApi.archive.mockResolvedValue({ success: false, error: 'Archive failed' });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success = false;
      await act(async () => {
        success = await result.current.archiveAgent('agent-1');
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe('Archive failed');
    });
  });

  describe('event subscriptions', () => {
    /* Preconditions: Hook mounts
       Action: useAgents is called
       Assertions: Subscribes to agent events
       Requirements: agents.12.6 */
    it('should subscribe to agent events', async () => {
      renderHook(() => useAgents());

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });

      const subscribedEvents = mockSubscribe.mock.calls.map((call) => call[0]);
      expect(subscribedEvents).toContain(EVENT_TYPES.AGENT_CREATED);
      expect(subscribedEvents).toContain(EVENT_TYPES.AGENT_UPDATED);
      expect(subscribedEvents).toContain(EVENT_TYPES.AGENT_ARCHIVED);
    });

    /* Preconditions: Hook is mounted
       Action: AGENT_CREATED event is received
       Assertions: New agent is added to list
       Requirements: agents.12.1 */
    it('should add agent on AGENT_CREATED event', async () => {
      let createdHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.AGENT_CREATED) {
          createdHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCount = result.current.agents.length;

      act(() => {
        createdHandler({
          timestamp: Date.now(),
          data: {
            id: 'agent-new',
            name: 'New Agent',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        });
      });

      expect(result.current.agents.length).toBe(initialCount + 1);
    });

    /* Preconditions: Hook is mounted
       Action: AGENT_ARCHIVED event is received
       Assertions: Agent is removed from list
       Requirements: agents.12.3 */
    it('should remove agent on AGENT_ARCHIVED event', async () => {
      let archivedHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.AGENT_ARCHIVED) {
          archivedHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCount = result.current.agents.length;

      act(() => {
        archivedHandler({
          timestamp: Date.now(),
          id: 'agent-1',
        });
      });

      expect(result.current.agents.length).toBe(initialCount - 1);
      expect(result.current.agents.find((a) => a.agentId === 'agent-1')).toBeUndefined();
    });

    /* Preconditions: Hook is mounted
       Action: AGENT_UPDATED event is received
       Assertions: Agent is updated in list
       Requirements: agents.12.2 */
    it('should update agent on AGENT_UPDATED event', async () => {
      let updatedHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.AGENT_UPDATED) {
          updatedHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        updatedHandler({
          timestamp: Date.now(),
          id: 'agent-1',
          changedFields: {
            name: 'Updated Name',
            updatedAt: Date.now(),
          },
        });
      });

      const updatedAgent = result.current.agents.find((a) => a.agentId === 'agent-1');
      expect(updatedAgent?.name).toBe('Updated Name');
    });

    /* Preconditions: Hook is mounted
       Action: AGENT_UPDATED event with only name change
       Assertions: Only name is updated
       Requirements: agents.12.2 */
    it('should handle partial update in AGENT_UPDATED event', async () => {
      let updatedHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.AGENT_UPDATED) {
          updatedHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const originalUpdatedAt = result.current.agents.find(
        (a) => a.agentId === 'agent-1'
      )?.updatedAt;

      act(() => {
        updatedHandler({
          timestamp: Date.now(),
          id: 'agent-1',
          changedFields: {
            name: 'Only Name Changed',
          },
        });
      });

      const updatedAgent = result.current.agents.find((a) => a.agentId === 'agent-1');
      expect(updatedAgent?.name).toBe('Only Name Changed');
      expect(updatedAgent?.updatedAt).toBe(originalUpdatedAt);
    });

    /* Preconditions: Hook is mounted
       Action: AGENT_CREATED event with no data
       Assertions: No error, agents unchanged
       Requirements: agents.12.1 */
    it('should handle AGENT_CREATED event with no data', async () => {
      let createdHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.AGENT_CREATED) {
          createdHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCount = result.current.agents.length;

      act(() => {
        createdHandler({
          timestamp: Date.now(),
          data: null,
        });
      });

      expect(result.current.agents.length).toBe(initialCount);
    });

    /* Preconditions: Hook is mounted
       Action: AGENT_UPDATED event with no id
       Assertions: No error, agents unchanged
       Requirements: agents.12.2 */
    it('should handle AGENT_UPDATED event with no id', async () => {
      let updatedHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.AGENT_UPDATED) {
          updatedHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const originalAgent = { ...result.current.agents[0] };

      act(() => {
        updatedHandler({
          timestamp: Date.now(),
          id: null,
          changedFields: { name: 'Should not apply' },
        });
      });

      expect(result.current.agents[0].name).toBe(originalAgent.name);
    });

    /* Preconditions: Hook is mounted
       Action: AGENT_ARCHIVED event with no id
       Assertions: No error, agents unchanged
       Requirements: agents.12.3 */
    it('should handle AGENT_ARCHIVED event with no id', async () => {
      let archivedHandler: (payload: any) => void;
      mockSubscribe.mockImplementation((type, handler) => {
        if (type === EVENT_TYPES.AGENT_ARCHIVED) {
          archivedHandler = handler;
        }
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCount = result.current.agents.length;

      act(() => {
        archivedHandler({
          timestamp: Date.now(),
          id: null,
        });
      });

      expect(result.current.agents.length).toBe(initialCount);
    });
  });

  describe('error handling', () => {
    /* Preconditions: API throws exception
       Action: useAgents is called
       Assertions: Error is caught and set
       Requirements: agents.10 */
    it('should handle API exceptions on load', async () => {
      mockAgentsApi.list.mockRejectedValue(new Error('Network failure'));

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network failure');
    });

    /* Preconditions: API throws non-Error
       Action: useAgents is called
       Assertions: Generic error message is set
       Requirements: agents.10 */
    it('should handle non-Error exceptions on load', async () => {
      mockAgentsApi.list.mockRejectedValue('Unknown error');

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load agents');
    });

    /* Preconditions: API throws exception on create
       Action: createAgent is called
       Assertions: Error is caught
       Requirements: agents.2 */
    it('should handle API exceptions on create', async () => {
      mockAgentsApi.create.mockRejectedValue(new Error('Create network error'));

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let createdAgent: Agent | null = null;
      await act(async () => {
        createdAgent = await result.current.createAgent();
      });

      expect(createdAgent).toBeNull();
      expect(result.current.error).toBe('Create network error');
    });

    /* Preconditions: API throws non-Error on create
       Action: createAgent is called
       Assertions: Generic error message is set
       Requirements: agents.2 */
    it('should handle non-Error exceptions on create', async () => {
      mockAgentsApi.create.mockRejectedValue('Unknown create error');

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let createdAgent: Agent | null = null;
      await act(async () => {
        createdAgent = await result.current.createAgent();
      });

      expect(createdAgent).toBeNull();
      expect(result.current.error).toBe('Failed to create agent');
    });

    /* Preconditions: API throws exception on archive
       Action: archiveAgent is called
       Assertions: Error is caught
       Requirements: agents.10 */
    it('should handle API exceptions on archive', async () => {
      mockAgentsApi.archive.mockRejectedValue(new Error('Archive network error'));

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success = true;
      await act(async () => {
        success = await result.current.archiveAgent('agent-1');
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe('Archive network error');
    });

    /* Preconditions: API throws non-Error on archive
       Action: archiveAgent is called
       Assertions: Generic error message is set
       Requirements: agents.10 */
    it('should handle non-Error exceptions on archive', async () => {
      mockAgentsApi.archive.mockRejectedValue('Unknown archive error');

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success = true;
      await act(async () => {
        success = await result.current.archiveAgent('agent-1');
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe('Failed to archive agent');
    });
  });

  describe('refreshAgents', () => {
    /* Preconditions: Hook is mounted
       Action: refreshAgents is called
       Assertions: Agents are reloaded from API
       Requirements: agents.10 */
    it('should reload agents from API', async () => {
      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callCountBefore = mockAgentsApi.list.mock.calls.length;

      await act(async () => {
        await result.current.refreshAgents();
      });

      expect(mockAgentsApi.list).toHaveBeenCalledTimes(callCountBefore + 1);
    });
  });
});
