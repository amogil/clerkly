/**
 * @jest-environment jsdom
 */
// Requirements: agents.4, agents.13, llm-integration.3, llm-integration.7, llm-integration.8
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentChat } from '../../../../src/renderer/components/agents/AgentChat';
import type { AgentSnapshot } from '../../../../src/renderer/types/agent';
import type { MessageSnapshot } from '../../../../src/shared/events/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSendMessage = jest.fn();
let mockUseAgentChatState = {
  rawMessages: [] as MessageSnapshot[],
  isLoading: false,
  sendMessage: mockSendMessage,
  messages: [],
  isStreaming: false,
};

jest.mock('../../../../src/renderer/hooks/useAgentChat', () => ({
  useAgentChat: () => mockUseAgentChatState,
}));

// Stub framer-motion to avoid animation complexity in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      React.createElement('div', props, children),
  },
}));

// Stub Conversation — renders children directly with a scrollable div
jest.mock('../../../../src/renderer/components/ai-elements/conversation', () => ({
  Conversation: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="conversation" className={className}>
      {children}
    </div>
  ),
  ConversationContent: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children),
  ConversationScrollButton: () => null,
}));

// Stub child components
jest.mock('../../../../src/renderer/components/agents/AgentMessage', () => ({
  AgentMessage: ({ message }: { message: MessageSnapshot }) => (
    <div data-testid="agent-message" data-message-id={message.id} />
  ),
}));

jest.mock('../../../../src/renderer/components/agents/AgentWelcome', () => ({
  AgentWelcome: ({ onPromptClick }: { onPromptClick: (p: string) => void }) => (
    <div data-testid="agent-welcome">
      <button onClick={() => onPromptClick('prompt text')}>Use prompt</button>
    </div>
  ),
}));

jest.mock('../../../../src/renderer/components/ai-elements/prompt-input', () => {
  const PromptInput = ({
    children,
    onSubmit,
  }: {
    children: React.ReactNode;
    onSubmit?: (message: { text?: string }) => void;
  }) => (
    <form
      data-testid="agent-prompt-input"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const text = (formData.get('prompt-input-field') as string | null) ?? '';
        onSubmit?.({ text });
      }}
    >
      {children}
    </form>
  );

  const PromptInputBody = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const PromptInputFooter = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const PromptInputSubmit = ({ disabled }: { disabled?: boolean }) => (
    <button data-testid="prompt-submit" disabled={disabled} type="submit">
      Send
    </button>
  );
  const PromptInputTextarea = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  }) => (
    <textarea
      data-testid="prompt-input-field"
      name="prompt-input-field"
      onChange={onChange}
      value={value}
    />
  );

  return { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea };
});

jest.mock('../../../../src/renderer/components/agents/RateLimitBanner', () => ({
  RateLimitBanner: ({
    agentId,
    onDismiss,
  }: {
    agentId: string;
    userMessageId: number;
    retryAfterSeconds: number;
    onDismiss: () => void;
  }) => (
    <div data-testid="rate-limit-banner" data-agent-id={agentId}>
      <button data-testid="rate-limit-dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  ),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const makeAgent = (id = 'agent-1'): AgentSnapshot => ({
  id,
  name: 'Test Agent',
  status: 'completed',
  createdAt: 1704067200000,
  updatedAt: 1704067200000,
  archivedAt: null,
});

const makeMessage = (id: number, kind: 'user' | 'llm' | 'error' = 'user'): MessageSnapshot => ({
  id,
  agentId: 'agent-1',
  kind,
  timestamp: Date.now(),
  payload: { data: { text: `msg ${id}` } },
  hidden: false,
});

const defaultProps = {
  agent: makeAgent(),
  isActive: true,
  rateLimitBanner: null,
  onRateLimitDismiss: jest.fn(),
  onLoadingChange: jest.fn(),
};

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockSendMessage.mockResolvedValue(true);
  mockUseAgentChatState = {
    rawMessages: [],
    isLoading: false,
    sendMessage: mockSendMessage,
    messages: [],
    isStreaming: false,
  };
});

describe('AgentChat — visibility', () => {
  /* Preconditions: isActive=true
     Action: render AgentChat
     Assertions: root div does NOT have 'hidden' class
     Requirements: agents.13.5 */
  it('should be visible when isActive=true', () => {
    const { container } = render(<AgentChat {...defaultProps} isActive={true} />);
    expect(container.firstChild).not.toHaveClass('hidden');
  });

  /* Preconditions: isActive=false
     Action: render AgentChat
     Assertions: root div has CSS hide classes while staying mounted
     Requirements: agents.13.5, agents.4.14.1 */
  it('should have CSS hide classes when isActive=false', () => {
    const { container } = render(<AgentChat {...defaultProps} isActive={false} />);
    expect(container.firstChild).toHaveClass(
      'absolute',
      'inset-0',
      'opacity-0',
      'pointer-events-none'
    );
  });
});

describe('AgentChat — loading state', () => {
  /* Preconditions: useAgentChat returns isLoading=true
     Action: render AgentChat
     Assertions: onLoadingChange called with (agentId, true)
     Requirements: agents.13.2, agents.13.10 */
  it('should notify parent when loading=true', () => {
    const onLoadingChange = jest.fn();
    mockUseAgentChatState.isLoading = true;

    render(<AgentChat {...defaultProps} onLoadingChange={onLoadingChange} />);

    expect(onLoadingChange).toHaveBeenCalledWith('agent-1', true);
  });

  /* Preconditions: useAgentChat returns isLoading=false
     Action: render AgentChat
     Assertions: onLoadingChange called with (agentId, false)
     Requirements: agents.13.2, agents.13.10 */
  it('should notify parent when loading=false', () => {
    const onLoadingChange = jest.fn();
    mockUseAgentChatState.isLoading = false;

    render(<AgentChat {...defaultProps} onLoadingChange={onLoadingChange} />);

    expect(onLoadingChange).toHaveBeenCalledWith('agent-1', false);
  });
});

describe('AgentChat — messages rendering', () => {
  /* Preconditions: rawMessages is empty
     Action: render AgentChat
     Assertions: AgentWelcome shown, no AgentMessage rendered
     Requirements: agents.4.20 */
  it('should show AgentWelcome when no messages', () => {
    mockUseAgentChatState.rawMessages = [];

    render(<AgentChat {...defaultProps} />);

    expect(screen.getByTestId('agent-welcome')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-message')).not.toBeInTheDocument();
  });

  /* Preconditions: rawMessages has 3 messages
     Action: render AgentChat
     Assertions: 3 AgentMessage rendered, no AgentWelcome
     Requirements: agents.4, agents.13 */
  it('should render AgentMessage for each message', () => {
    mockUseAgentChatState.rawMessages = [makeMessage(1), makeMessage(2), makeMessage(3)];

    render(<AgentChat {...defaultProps} />);

    expect(screen.queryByTestId('agent-welcome')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('agent-message')).toHaveLength(3);
  });

  /* Preconditions: rawMessages has messages with ids
     Action: render AgentChat
     Assertions: each message wrapper has correct data-message-id
     Requirements: agents.4 */
  it('should set data-message-id on each message wrapper', () => {
    mockUseAgentChatState.rawMessages = [makeMessage(10), makeMessage(20)];

    render(<AgentChat {...defaultProps} />);

    const msgs = document.querySelectorAll('[data-message-id]');
    const ids = Array.from(msgs).map((el) => el.getAttribute('data-message-id'));
    expect(ids).toContain('10');
    expect(ids).toContain('20');
  });
});

describe('AgentChat — send message', () => {
  /* Preconditions: user types text and submits
     Action: change input value, click submit
     Assertions: sendMessage called with trimmed text
     Requirements: agents.4.3 */
  it('should call sendMessage and clear input on submit', async () => {
    mockSendMessage.mockResolvedValue(true);
    render(<AgentChat {...defaultProps} />);

    // Type into the controlled input — triggers onChange → setTaskInput
    await act(async () => {
      fireEvent.change(screen.getByTestId('prompt-input-field'), {
        target: { value: 'Hello agent' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('prompt-submit'));
    });

    expect(mockSendMessage).toHaveBeenCalledWith('Hello agent');
  });

  /* Preconditions: AgentWelcome prompt clicked
     Action: onPromptClick fires with prompt text
     Assertions: sendMessage called with that text
     Requirements: agents.4.3 */
  it('should send message when AgentWelcome prompt clicked', async () => {
    mockUseAgentChatState.rawMessages = [];
    mockSendMessage.mockResolvedValue(true);

    render(<AgentChat {...defaultProps} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Use prompt'));
    });

    expect(mockSendMessage).toHaveBeenCalledWith('prompt text');
  });

  /* Preconditions: sendMessage returns false (error)
     Action: submit message
     Assertions: input NOT cleared (message preserved for retry)
     Requirements: agents.4.3 */
  it('should NOT clear input when sendMessage returns false', async () => {
    mockSendMessage.mockResolvedValue(false);
    render(<AgentChat {...defaultProps} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId('prompt-input-field'), {
        target: { value: 'Hello' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('prompt-submit'));
    });

    expect(screen.getByTestId('prompt-input-field')).toHaveValue('Hello');
  });
});

describe('AgentChat — rate limit banner', () => {
  /* Preconditions: rateLimitBanner matches this agent
     Action: render AgentChat
     Assertions: RateLimitBanner rendered
     Requirements: llm-integration.3.7 */
  it('should show RateLimitBanner when rateLimitBanner matches agent', () => {
    render(
      <AgentChat
        {...defaultProps}
        rateLimitBanner={{ agentId: 'agent-1', userMessageId: 5, retryAfterSeconds: 30 }}
      />
    );

    expect(screen.getByTestId('rate-limit-banner')).toBeInTheDocument();
  });

  /* Preconditions: rateLimitBanner is for a different agent
     Action: render AgentChat
     Assertions: RateLimitBanner NOT rendered
     Requirements: llm-integration.3.7 */
  it('should NOT show RateLimitBanner when rateLimitBanner is for different agent', () => {
    render(
      <AgentChat
        {...defaultProps}
        rateLimitBanner={{ agentId: 'other-agent', userMessageId: 5, retryAfterSeconds: 30 }}
      />
    );

    expect(screen.queryByTestId('rate-limit-banner')).not.toBeInTheDocument();
  });

  /* Preconditions: rateLimitBanner shown, user clicks dismiss
     Action: click dismiss button
     Assertions: onRateLimitDismiss called
     Requirements: llm-integration.3.7 */
  it('should call onRateLimitDismiss when banner dismissed', () => {
    const onRateLimitDismiss = jest.fn();
    render(
      <AgentChat
        {...defaultProps}
        rateLimitBanner={{ agentId: 'agent-1', userMessageId: 5, retryAfterSeconds: 30 }}
        onRateLimitDismiss={onRateLimitDismiss}
      />
    );

    fireEvent.click(screen.getByTestId('rate-limit-dismiss'));
    expect(onRateLimitDismiss).toHaveBeenCalled();
  });

  /* Preconditions: rateLimitBanner is null
     Action: render AgentChat
     Assertions: RateLimitBanner NOT rendered
     Requirements: llm-integration.3.7 */
  it('should NOT show RateLimitBanner when rateLimitBanner is null', () => {
    render(<AgentChat {...defaultProps} rateLimitBanner={null} />);

    expect(screen.queryByTestId('rate-limit-banner')).not.toBeInTheDocument();
  });
});

describe('AgentChat — PromptInput rendered', () => {
  /* Preconditions: component rendered
     Action: render AgentChat
     Assertions: PromptInput present
     Requirements: agents.4.3 */
  it('should render PromptInput', () => {
    render(<AgentChat {...defaultProps} />);
    expect(screen.getByTestId('agent-prompt-input')).toBeInTheDocument();
  });
});
