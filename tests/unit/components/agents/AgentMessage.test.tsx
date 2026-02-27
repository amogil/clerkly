/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentMessage } from '../../../../src/renderer/components/agents/AgentMessage';
import type { MessageSnapshot } from '../../../../src/shared/events/types';

const mockRetryLast = jest.fn().mockResolvedValue({ success: true });
(window as any).api = {
  messages: {
    retryLast: mockRetryLast,
  },
};

const baseMessage = (overrides: Partial<MessageSnapshot> = {}): MessageSnapshot =>
  ({
    id: 1,
    agentId: 'agent1',
    kind: 'user',
    timestamp: '2024-01-01T00:00:00Z',
    hidden: false,
    payload: { data: { text: 'Hello' } },
    replyToMessageId: null,
    ...overrides,
  }) as MessageSnapshot;

describe('AgentMessage — user', () => {
  /* Preconditions: kind:user message
     Action: render AgentMessage
     Assertions: message-user testid visible, text rendered
     Requirements: agents.4.9, agents.4.22 */
  it('should render user message text', () => {
    render(
      <AgentMessage
        message={baseMessage({ kind: 'user', payload: { data: { text: 'Hello world' } } })}
        showAvatar={false}
        agentStatus="completed"
      />
    );
    expect(screen.getByTestId('message-user')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  /* Preconditions: kind:user message with empty text
     Action: render AgentMessage
     Assertions: renders without crash, empty string shown
     Requirements: agents.4.9 */
  it('should render empty user message without crash', () => {
    render(
      <AgentMessage
        message={baseMessage({ kind: 'user', payload: { data: {} } })}
        showAvatar={false}
        agentStatus="completed"
      />
    );
    expect(screen.getByTestId('message-user')).toBeInTheDocument();
  });
});

describe('AgentMessage — llm', () => {
  /* Preconditions: kind:llm with action.content
     Action: render AgentMessage
     Assertions: message-llm and message-llm-action visible, content rendered
     Requirements: llm-integration.7 */
  it('should render llm message with action content', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'llm',
          payload: { data: { action: { type: 'final_answer', content: 'Response text' } } },
        })}
        showAvatar={false}
        agentStatus="completed"
      />
    );
    expect(screen.getByTestId('message-llm')).toBeInTheDocument();
    expect(screen.getByTestId('message-llm-action')).toBeInTheDocument();
    expect(screen.getByText('Response text')).toBeInTheDocument();
  });

  /* Preconditions: kind:llm without action (streaming)
     Action: render AgentMessage
     Assertions: loading indicator shown, no action content
     Requirements: llm-integration.7 */
  it('should render loading indicator when action is absent', () => {
    render(
      <AgentMessage
        message={baseMessage({ kind: 'llm', payload: { data: {} } })}
        showAvatar={false}
        agentStatus="in-progress"
      />
    );
    expect(screen.getByTestId('message-llm-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('message-llm-action')).not.toBeInTheDocument();
  });

  /* Preconditions: kind:llm with reasoning and action
     Action: render AgentMessage
     Assertions: reasoning testid present, action content present
     Requirements: llm-integration.2, llm-integration.7 */
  it('should render reasoning block when present', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'llm',
          payload: {
            data: {
              reasoning: { text: 'Thinking...' },
              action: { type: 'final_answer', content: 'Answer' },
            },
          },
        })}
        showAvatar={false}
        agentStatus="completed"
      />
    );
    expect(screen.getByTestId('message-llm-reasoning')).toBeInTheDocument();
    expect(screen.getByTestId('message-llm-action')).toBeInTheDocument();
  });

  /* Preconditions: kind:llm with action but no reasoning
     Action: render AgentMessage
     Assertions: no reasoning block rendered
     Requirements: llm-integration.7 */
  it('should not render reasoning when absent', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'llm',
          payload: { data: { action: { content: 'Answer' } } },
        })}
        showAvatar={false}
        agentStatus="completed"
      />
    );
    expect(screen.queryByTestId('message-llm-reasoning')).not.toBeInTheDocument();
  });

  /* Preconditions: kind:llm, showAvatar=true
     Action: render AgentMessage
     Assertions: Logo (svg) rendered above message
     Requirements: agents.4.22 */
  it('should render avatar when showAvatar is true', () => {
    const { container } = render(
      <AgentMessage
        message={baseMessage({ kind: 'llm', payload: { data: { action: { content: 'Hi' } } } })}
        showAvatar={true}
        agentStatus="completed"
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  /* Preconditions: kind:llm, showAvatar=false
     Action: render AgentMessage
     Assertions: no Logo rendered
     Requirements: agents.4.22 */
  it('should not render avatar when showAvatar is false', () => {
    const { container } = render(
      <AgentMessage
        message={baseMessage({ kind: 'llm', payload: { data: { action: { content: 'Hi' } } } })}
        showAvatar={false}
        agentStatus="completed"
      />
    );
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});

describe('AgentMessage — error', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* Preconditions: kind:error with error message
     Action: render AgentMessage
     Assertions: message-error testid visible, error text shown
     Requirements: llm-integration.7 */
  it('should render error message text', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'error',
          payload: { data: { error: { message: 'Something went wrong' } } },
        })}
        showAvatar={false}
        agentStatus="error"
      />
    );
    expect(screen.getByTestId('message-error')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  /* Preconditions: kind:error without error info
     Action: render AgentMessage
     Assertions: fallback "Unknown error" shown
     Requirements: llm-integration.7 */
  it('should render fallback text when error info absent', () => {
    render(
      <AgentMessage
        message={baseMessage({ kind: 'error', payload: { data: {} } })}
        showAvatar={false}
        agentStatus="error"
      />
    );
    expect(screen.getByText('Unknown error')).toBeInTheDocument();
  });

  /* Preconditions: kind:error with action_link, onNavigate provided
     Action: click action_link button
     Assertions: onNavigate called with correct screen
     Requirements: llm-integration.3.4.1 */
  it('should call onNavigate when action_link clicked', () => {
    const onNavigate = jest.fn();
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'error',
          payload: {
            data: {
              error: {
                type: 'auth',
                message: 'API key invalid',
                action_link: { label: 'Open Settings', screen: 'settings' },
              },
            },
          },
          replyToMessageId: 99,
        })}
        showAvatar={false}
        agentStatus="error"
        onNavigate={onNavigate}
      />
    );
    fireEvent.click(screen.getByTestId('message-error-action-link'));
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  /* Preconditions: kind:error auth
     Action: click Retry button
     Assertions: retryLast called for agent
     Requirements: llm-integration.3.4.3 */
  it('should retry last message when retry action clicked', async () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'error',
          payload: {
            data: {
              error: {
                type: 'auth',
                message: 'API key invalid',
                action_link: { label: 'Open Settings', screen: 'settings' },
              },
            },
          },
        })}
        showAvatar={false}
        agentStatus="error"
      />
    );

    fireEvent.click(screen.getByTestId('message-error-retry'));
    await Promise.resolve();
    expect(mockRetryLast).toHaveBeenCalledWith('agent1');
  });

  /* Preconditions: kind:error with action_link, no onNavigate
     Action: render AgentMessage
     Assertions: action_link button not rendered
     Requirements: llm-integration.3.4.1 */
  it('should not render action_link when onNavigate not provided', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'error',
          payload: {
            data: {
              error: {
                message: 'Error',
                action_link: { label: 'Open Settings', screen: 'settings' },
              },
            },
          },
        })}
        showAvatar={false}
        agentStatus="error"
      />
    );
    expect(screen.queryByTestId('message-error-action-link')).not.toBeInTheDocument();
  });
});
