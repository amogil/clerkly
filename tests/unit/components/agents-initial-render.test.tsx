/**
 * @jest-environment jsdom
 */

// Requirements: agents.1.4.4
// Unit tests for Agents component initial render behavior

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock ResizeObserver which is not available in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock scrollIntoView which is not available in jsdom
Element.prototype.scrollIntoView = jest.fn();

// Mock offsetWidth so visibleChatsCount calculation shows all agents
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get() {
    return 400;
  },
});

// Mock hooks
const mockUseAgents = jest.fn();
const mockUseAgentChat = jest.fn();

jest.mock('../../../src/renderer/hooks/useAgents', () => ({
  useAgents: () => mockUseAgents(),
}));

jest.mock('../../../src/renderer/hooks/useAgentChat', () => ({
  useAgentChat: () => mockUseAgentChat(),
}));

// Mock components
jest.mock('../../../src/renderer/components/logo', () => ({
  Logo: () => <div data-testid="logo">Logo</div>,
}));

jest.mock('../../../src/renderer/components/agents/AgentWelcome', () => ({
  AgentWelcome: () => <div data-testid="empty-state">Empty State</div>,
}));

jest.mock('../../../src/shared/utils/DateTimeFormatter', () => ({
  DateTimeFormatter: {
    formatDateTime: (date: Date) => date.toISOString(),
    formatLogTimestamp: (date: Date) => date.toISOString(),
  },
}));

// Mock motion/react
jest.mock('motion/react', () => ({
  motion: {
    div: ({ children, layout, ...props }: any) => {
      return (
        <div {...props} data-layout={layout !== undefined ? String(layout) : 'undefined'}>
          {children}
        </div>
      );
    },
  },
}));

// Mock framer-motion (used by AgentHeader)
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, layout, ...props }: any) => {
      return (
        <div {...props} data-layout={layout !== undefined ? String(layout) : 'undefined'}>
          {children}
        </div>
      );
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Send: () => <div>Send</div>,
  Plus: () => <div>Plus</div>,
  Check: () => <div>Check</div>,
  X: () => <div>X</div>,
  HelpCircle: () => <div>HelpCircle</div>,
  ArrowLeft: () => <div>ArrowLeft</div>,
}));

import { Agents } from '../../../src/renderer/components/agents';
import { AgentSnapshot } from '../../../src/shared/events/types';

describe('Agents Initial Render', () => {
  const mockAgents: AgentSnapshot[] = [
    {
      id: 'agent1',
      name: 'Agent 1',
      status: 'new',
      createdAt: new Date('2024-01-01').getTime(),
      updatedAt: new Date('2024-01-01').getTime(),
      archivedAt: null,
    },
    {
      id: 'agent2',
      name: 'Agent 2',
      status: 'new',
      createdAt: new Date('2024-01-02').getTime(),
      updatedAt: new Date('2024-01-02').getTime(),
      archivedAt: null,
    },
    {
      id: 'agent3',
      name: 'Agent 3',
      status: 'new',
      createdAt: new Date('2024-01-03').getTime(),
      updatedAt: new Date('2024-01-03').getTime(),
      archivedAt: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAgents.mockReturnValue({
      agents: mockAgents,
      activeAgent: mockAgents[0],
      createAgent: jest.fn(),
      selectAgent: jest.fn(),
      archiveAgent: jest.fn(),
      refreshAgents: jest.fn(),
      isLoading: false,
    });

    mockUseAgentChat.mockReturnValue({
      rawMessages: [],
      sendMessage: jest.fn(),
      refreshMessages: jest.fn(),
      isLoading: false,
    });
  });

  /* Preconditions: Component renders with multiple agents
     Action: Check layout animation props on initial render
     Assertions: agent icons do not render layout animation attributes
     Requirements: agents.1.4.4 */
  it('should render agent icons without layout animation', () => {
    render(<Agents />);

    // Check that agents are rendered
    const agentsContainer = screen.getByTestId('agents');
    expect(agentsContainer).toBeInTheDocument();

    // Check that agent icons are rendered
    const agentIcons = screen.getAllByTestId(/^agent-icon-/);
    expect(agentIcons.length).toBe(3);

    // Layout animation is not used for header reordering
    agentIcons.forEach((icon) => {
      expect(icon.getAttribute('data-layout')).not.toBe('true');
    });
  });

  /* Preconditions: Component renders with single auto-created agent
     Action: Check that agent icon is rendered
     Assertions: agent icon is present without layout animation attributes
     Requirements: agents.1.4.4 */
  it('should render auto-created first agent without layout animation', () => {
    const singleAgent = [mockAgents[0]];

    mockUseAgents.mockReturnValue({
      agents: singleAgent,
      activeAgent: singleAgent[0],
      createAgent: jest.fn(),
      selectAgent: jest.fn(),
      archiveAgent: jest.fn(),
      refreshAgents: jest.fn(),
      isLoading: false,
    });

    render(<Agents />);

    // Check that single agent is rendered
    const agentIcon = screen.getByTestId(`agent-icon-${singleAgent[0].id}`);
    expect(agentIcon).toBeInTheDocument();
    expect(agentIcon.getAttribute('data-layout')).not.toBe('true');
  });
});
