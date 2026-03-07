/**
 * @jest-environment jsdom
 */
// Requirements: agents.13.2, agents.13.10
import React, { useEffect } from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Agents } from '../../../src/renderer/components/agents';
import type { AgentSnapshot } from '../../../src/shared/events/types';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

Element.prototype.scrollIntoView = jest.fn();

Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get() {
    return 400;
  },
});

const mockUseAgents = jest.fn();

jest.mock('../../../src/renderer/hooks/useAgents', () => ({
  useAgents: () => mockUseAgents(),
}));

jest.mock('../../../src/renderer/events/useEventSubscription', () => ({
  useEventSubscription: () => {},
}));

jest.mock('../../../src/renderer/components/agents/AgentHeader', () => ({
  AgentHeader: () => <div data-testid="agent-header" />,
}));

jest.mock('../../../src/renderer/components/agents/AllAgentsPage', () => ({
  AllAgentsPage: () => <div data-testid="all-agents-page" />,
}));

jest.mock('../../../src/renderer/components/agents/AgentChat', () => ({
  AgentChat: ({
    agent,
    onLoadingChange,
    onStartupSettledChange,
  }: {
    agent: AgentSnapshot;
    onLoadingChange?: (agentId: string, loading: boolean) => void;
    onStartupSettledChange?: (agentId: string, settled: boolean) => void;
  }) => {
    useEffect(() => {
      onLoadingChange?.(agent.id, false);
      onStartupSettledChange?.(agent.id, true);
    }, [agent.id, onLoadingChange, onStartupSettledChange]);
    return <div data-testid={`agent-chat-${agent.id}`} />;
  },
}));

const makeAgent = (id: string): AgentSnapshot => ({
  id,
  name: `Agent ${id}`,
  status: 'completed',
  createdAt: 1704067200000,
  updatedAt: 1704067200000,
  archivedAt: null,
});

describe('Agents loading state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const agents = [makeAgent('agent-1')];
    mockUseAgents.mockReturnValue({
      agents,
      activeAgent: agents[0],
      createAgent: jest.fn(),
      selectAgent: jest.fn(),
      archiveAgent: jest.fn(),
      refreshAgents: jest.fn(),
      isLoading: false,
    });
  });

  /* Preconditions: One agent, agent chat reports loaded
     Action: Render Agents with onChatsLoadingChange
     Assertions: Loading state emits true then false
     Requirements: agents.13.2, agents.13.10 */
  it('should notify when chats finish loading', async () => {
    const onChatsLoadingChange = jest.fn();
    render(<Agents onChatsLoadingChange={onChatsLoadingChange} />);

    expect(onChatsLoadingChange).toHaveBeenCalledWith(true);

    await waitFor(
      () => {
        expect(onChatsLoadingChange).toHaveBeenLastCalledWith(false);
      },
      { timeout: 2000 }
    );
  });
});
