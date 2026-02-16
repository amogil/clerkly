/**
 * @jest-environment jsdom
 */
// Requirements: agents.2, agents.3, agents.10, agents.12, error-notifications.2
/**
 * Unit tests for useAgents hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { EVENT_TYPES } from '../../../src/shared/events/constants';
import type { Agent } from '../../../src/renderer/types/agent';

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
    {
      agentId: 'agent-3',
      userId: 'user-1',
      name: 'Agent 3',
      createdAt: '2024-01-01T08:00:00Z',
      updatedAt: '2024-01-01T08:00:00Z',
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
      expect(result.current.agents).toHaveLength(3);
    });

    /* Preconditions: Hook mounts with empty agent list
       Action: useAgents is called
       Assertions: New agent is auto-created
       Requirements: agents.2.7, agents.2.8 */
    it('should auto-create agent when list is empty on mount', async () => {
      mockAgentsApi.list.mockResolvedValue({ success: true, data: [] });
      const newAgent: Agent = {
        agentId: 'auto-created',
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

      await waitFor(() => {
        expect(mockAgentsApi.create).toHaveBeenCalledWith('New Agent');
      });
      expect(result.current.agents).toHaveLength(1);
      expect(result.current.agents[0].agentId).toBe('auto-created');
      expect(result.current.activeAgent?.agentId).toBe('auto-created');
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

    /* Preconditions: Hook mounts with empty agent list
       Action: useAgents is called
       Assertions: New agent is auto-created
       Requirements: agents.2.7, agents.2.8 */
    it('should auto-create agent when list is empty on mount', async () => {
      mockAgentsApi.list.mockResolvedValue({ success: true, data: [] });
      const newAgent: Agent = {
        agentId: 'auto-created',
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

      await waitFor(() => {
        expect(mockAgentsApi.create).toHaveBeenCalledWith('New Agent');
      });
      expect(result.current.agents).toHaveLength(1);
      expect(result.current.agents[0].agentId).toBe('auto-created');
      expect(result.current.activeAgent?.agentId).toBe('auto-created');
    });

    /* Preconditions: API returns error
       Action: useAgents is called
       Assertions: Toast error is shown
       Requirements: agents.10, error-notifications.2 */
    it('should show toast on API failure', async () => {
      const { toast } = require('sonner');
      mockAgentsApi.list.mockResolvedValue({ success: false, error: 'Network error' });

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(toast.error).toHaveBeenCalledWith('Loading agents: Network error');
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

      await waitFor(() => {
        expect(mockAgentsApi.create).toHaveBeenCalledWith('New Agent');
      });
      expect(createdAgent).toEqual(newAgent);
    });

    /* Preconditions: Hook is mounted
       Action: createAgent fails
       Assertions: Error is set and null is returned
       Requirements: agents.2 */
    it('should set error on create failure', async () => {
      const { toast } = require('sonner');
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
      expect(toast.error).toHaveBeenCalledWith('Creating agent: Create failed');
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

    /* Preconditions: Last agent is archived
       Action: archiveAgent is called on last agent
       Assertions: New agent is auto-created and selected
       Requirements: agents.2.7, agents.2.9, agents.2.10 */
    it('should auto-create agent when archiving last agent', async () => {
      // Start with only one agent
      mockAgentsApi.list.mockResolvedValue({ success: true, data: [mockAgents[0]] });
      const newAgent: Agent = {
        agentId: 'auto-created',
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

      expect(result.current.agents).toHaveLength(1);
      expect(result.current.activeAgent?.agentId).toBe('agent-1');

      await act(async () => {
        await result.current.archiveAgent('agent-1');
      });

      // Should auto-create new agent
      await waitFor(() => {
        expect(mockAgentsApi.create).toHaveBeenCalledWith('New Agent');
      });
      // Note: activeAgent will be null until AGENT_CREATED event fires
      // But the activeAgentId is set immediately, so when event fires, it will be selected
    });

    /* Preconditions: Hook is mounted
       Action: archiveAgent fails
       Assertions: Toast error is shown
       Requirements: agents.10, error-notifications.2 */
    it('should show toast on archive failure', async () => {
      const { toast } = require('sonner');
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
      expect(toast.error).toHaveBeenCalledWith('Archiving agent: Archive failed');
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

    /* Preconditions: Hook is mounted with multiple agents
       Action: AGENT_UPDATED event updates updatedAt of last agent
       Assertions: Agent moves to first position in list
       Requirements: agents.1.4.1, agents.1.4.2, agents.12.2 */
    it('should reorder agents when updatedAt changes', async () => {
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

      // Initial order: agent-1 (newest), agent-2, agent-3 (oldest)
      expect(result.current.agents[0].agentId).toBe('agent-1');
      expect(result.current.agents[1].agentId).toBe('agent-2');
      expect(result.current.agents[2].agentId).toBe('agent-3');

      // Update agent-3 with new timestamp (making it newest)
      const newTimestamp = new Date('2024-01-04T10:00:00Z').getTime();
      act(() => {
        updatedHandler({
          timestamp: Date.now(),
          id: 'agent-3',
          changedFields: {
            updatedAt: newTimestamp,
          },
        });
      });

      // After update: agent-3 should be first (newest)
      expect(result.current.agents[0].agentId).toBe('agent-3');
      expect(result.current.agents[1].agentId).toBe('agent-1');
      expect(result.current.agents[2].agentId).toBe('agent-2');
    });

    /* Preconditions: Hook is mounted with multiple agents
       Action: Multiple AGENT_UPDATED events in sequence
       Assertions: Order changes dynamically with each update
       Requirements: agents.1.4.1, agents.1.4.2, agents.12.2 */
    it('should maintain correct order with multiple updates', async () => {
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

      // Update agent-2
      act(() => {
        updatedHandler({
          timestamp: Date.now(),
          id: 'agent-2',
          changedFields: {
            updatedAt: new Date('2024-01-04T10:00:00Z').getTime(),
          },
        });
      });

      expect(result.current.agents[0].agentId).toBe('agent-2');

      // Update agent-3 (should become first)
      act(() => {
        updatedHandler({
          timestamp: Date.now(),
          id: 'agent-3',
          changedFields: {
            updatedAt: new Date('2024-01-04T11:00:00Z').getTime(),
          },
        });
      });

      expect(result.current.agents[0].agentId).toBe('agent-3');
      expect(result.current.agents[1].agentId).toBe('agent-2');
      expect(result.current.agents[2].agentId).toBe('agent-1');
    });

    /* Preconditions: Hook is mounted
       Action: AGENT_UPDATED event with only name change (no updatedAt)
       Assertions: Order remains unchanged
       Requirements: agents.12.2 */
    it('should not reorder when only name changes', async () => {
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

      const initialOrder = result.current.agents.map((a) => a.agentId);

      // Update only name, not updatedAt
      act(() => {
        updatedHandler({
          timestamp: Date.now(),
          id: 'agent-3',
          changedFields: {
            name: 'New Name',
          },
        });
      });

      const newOrder = result.current.agents.map((a) => a.agentId);
      expect(newOrder).toEqual(initialOrder);
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
       Assertions: Toast error is shown
       Requirements: agents.10, error-notifications.2 */
    it('should show toast on API exceptions during load', async () => {
      const { toast } = require('sonner');
      mockAgentsApi.list.mockRejectedValue(new Error('Network failure'));

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(toast.error).toHaveBeenCalledWith('Loading agents: Network failure');
    });

    /* Preconditions: API throws non-Error
       Action: useAgents is called
       Assertions: Toast error is shown
       Requirements: agents.10, error-notifications.2 */
    it('should show toast on non-Error exceptions during load', async () => {
      const { toast } = require('sonner');
      mockAgentsApi.list.mockRejectedValue('Unknown error');

      const { result } = renderHook(() => useAgents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(toast.error).toHaveBeenCalledWith('Loading agents: Unknown error');
    });

    /* Preconditions: API throws exception on create
       Action: createAgent is called
       Assertions: Toast error is shown
       Requirements: agents.2, error-notifications.2 */
    it('should show toast on API exceptions during create', async () => {
      const { toast } = require('sonner');
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
      expect(toast.error).toHaveBeenCalledWith('Creating agent: Create network error');
    });

    /* Preconditions: API throws non-Error on create
       Action: createAgent is called
       Assertions: Toast error is shown
       Requirements: agents.2, error-notifications.2 */
    it('should show toast on non-Error exceptions during create', async () => {
      const { toast } = require('sonner');
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
      expect(toast.error).toHaveBeenCalledWith('Creating agent: Unknown create error');
    });

    /* Preconditions: API throws exception on archive
       Action: archiveAgent is called
       Assertions: Toast error is shown
       Requirements: agents.10, error-notifications.2 */
    it('should show toast on API exceptions during archive', async () => {
      const { toast } = require('sonner');
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
      expect(toast.error).toHaveBeenCalledWith('Archiving agent: Archive network error');
    });

    /* Preconditions: API throws non-Error on archive
       Action: archiveAgent is called
       Assertions: Toast error is shown
       Requirements: agents.10, error-notifications.2 */
    it('should show toast on non-Error exceptions during archive', async () => {
      const { toast } = require('sonner');
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
      expect(toast.error).toHaveBeenCalledWith('Archiving agent: Unknown archive error');
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
