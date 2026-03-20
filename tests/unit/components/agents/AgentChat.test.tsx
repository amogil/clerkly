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
const mockConversation = jest.fn(
  ({
    children,
    className,
    resize,
  }: {
    children: React.ReactNode;
    className?: string;
    resize?: string;
  }) => (
    <div data-testid="conversation" className={className} data-resize={resize}>
      {children}
    </div>
  )
);

jest.mock('../../../../src/renderer/components/ai-elements/conversation', () => ({
  Conversation: (props: { children: React.ReactNode; className?: string; resize?: string }) =>
    mockConversation(props),
  ConversationContent: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    React.createElement('div', props, children),
  ConversationScrollButton: () => null,
}));

// Stub child components
const mockAgentMessage = jest.fn(
  ({
    message,
    isReasoningStreaming,
  }: {
    message: MessageSnapshot;
    isReasoningStreaming?: boolean;
  }) => (
    <div
      data-testid="agent-message"
      data-message-id={message.id}
      data-reasoning-streaming={isReasoningStreaming ? 'true' : 'false'}
    />
  )
);

jest.mock('../../../../src/renderer/components/agents/AgentMessage', () => {
  const React = require('react') as typeof import('react');
  const MockAgentMessage = (props: {
    message: MessageSnapshot;
    isReasoningStreaming?: boolean;
    onNavigate?: (screen: string) => void;
  }) => mockAgentMessage(props);
  MockAgentMessage.displayName = 'MockAgentMessage';

  const MemoizedMockAgentMessage = React.memo(
    MockAgentMessage,
    (
      prev: {
        message: MessageSnapshot;
        isReasoningStreaming?: boolean;
        onNavigate?: (screen: string) => void;
      },
      next: {
        message: MessageSnapshot;
        isReasoningStreaming?: boolean;
        onNavigate?: (screen: string) => void;
      }
    ) =>
      prev.message === next.message &&
      prev.isReasoningStreaming === next.isReasoningStreaming &&
      prev.onNavigate === next.onNavigate
  );
  MemoizedMockAgentMessage.displayName = 'MemoizedMockAgentMessage';

  return {
    AgentMessage: MemoizedMockAgentMessage,
  };
});

jest.mock('../../../../src/renderer/components/agents/AgentWelcome', () => ({
  AgentWelcome: ({ onPromptClick }: { onPromptClick: (p: string) => void }) => (
    <div data-testid="agent-welcome">
      <button onClick={() => onPromptClick('prompt text')}>Use prompt</button>
    </div>
  ),
}));

jest.mock('../../../../src/renderer/components/ai-elements/prompt-input', () => {
  const PromptContext = React.createContext<{
    text: string;
    setText: React.Dispatch<React.SetStateAction<string>>;
  } | null>(null);

  const PromptInputProvider = ({ children }: { children: React.ReactNode }) => {
    const [text, setText] = React.useState('');
    return <PromptContext.Provider value={{ text, setText }}>{children}</PromptContext.Provider>;
  };

  const PromptInput = ({
    children,
    className,
    onSubmit,
  }: {
    children: React.ReactNode;
    className?: string;
    onSubmit?: (message: { text?: string }) => void | Promise<void>;
  }) => {
    const providerContext = React.useContext(PromptContext);
    const [localText, setLocalText] = React.useState('');
    const text = providerContext?.text ?? localText;
    const setText = providerContext?.setText ?? setLocalText;

    return (
      <form
        data-testid="agent-prompt-input"
        className={className}
        onSubmit={async (event) => {
          event.preventDefault();
          const result = onSubmit?.({ text });
          if (result instanceof Promise) {
            await result;
          }
        }}
      >
        <PromptContext.Provider value={{ text, setText }}>{children}</PromptContext.Provider>
      </form>
    );
  };

  const PromptInputBody = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const PromptInputFooter = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="prompt-input-footer" className={className}>
      {children}
    </div>
  );
  const PromptInputTools = ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="prompt-input-tools" className={className}>
      {children}
    </div>
  );
  const PromptInputSubmit = ({
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
    const context = React.useContext(PromptContext);
    const isDisabled = disabled ?? (context ? context.text.trim().length === 0 : false);
    return (
      <button data-testid="prompt-submit" disabled={isDisabled} type="submit" {...props}>
        Send
      </button>
    );
  };
  const PromptInputTextarea = React.forwardRef<
    HTMLTextAreaElement,
    React.TextareaHTMLAttributes<HTMLTextAreaElement>
  >(({ className, value, onChange, ...props }, ref) => {
    const context = React.useContext(PromptContext);
    const resolvedValue = value ?? context?.text ?? '';
    return (
      <textarea
        className={className}
        ref={ref}
        data-testid="prompt-input-field"
        name="prompt-input-field"
        onChange={(event) => {
          context?.setText(event.target.value);
          onChange?.(event);
        }}
        {...props}
        value={resolvedValue}
      />
    );
  });
  PromptInputTextarea.displayName = 'PromptInputTextarea';

  const usePromptInputController = () => {
    const context = React.useContext(PromptContext);
    if (!context) {
      throw new Error('Missing PromptInputProvider');
    }
    return {
      textInput: {
        value: context.text,
        setInput: context.setText,
        clear: () => context.setText(''),
      },
    };
  };

  return {
    PromptInput,
    PromptInputBody,
    PromptInputFooter,
    PromptInputTools,
    PromptInputProvider,
    PromptInputSubmit,
    PromptInputTextarea,
    usePromptInputController,
  };
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
  replyToMessageId: null,
  hidden: false,
  done: true,
});

const defaultProps = {
  agent: makeAgent(),
  isActive: true,
  rateLimitBanner: null,
  onRateLimitDismiss: jest.fn(),
  onLoadingChange: jest.fn(),
  onStartupSettledChange: jest.fn(),
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
  mockConversation.mockClear();
  mockAgentMessage.mockClear();
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

  /* Preconditions: Active chat still loads initial history
     Action: render AgentChat
     Assertions: startup settled callback is false
     Requirements: agents.4.14.6, agents.13.10 */
  it('should report startup settled=false while history is loading', () => {
    const onStartupSettledChange = jest.fn();
    mockUseAgentChatState.isLoading = true;

    render(<AgentChat {...defaultProps} onStartupSettledChange={onStartupSettledChange} />);

    expect(onStartupSettledChange).toHaveBeenCalledWith('agent-1', false);
  });

  /* Preconditions: Active chat has loaded history
     Action: render AgentChat and advance animation frames
     Assertions: startup settled callback becomes true once
     Requirements: agents.4.14.5, agents.13.2 */
  it('should report startup settled=true after initial active render stabilizes', () => {
    jest.useFakeTimers();
    const onStartupSettledChange = jest.fn();

    render(<AgentChat {...defaultProps} onStartupSettledChange={onStartupSettledChange} />);

    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(onStartupSettledChange).toHaveBeenCalledWith('agent-1', true);
    jest.useRealTimers();
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

  /* Preconditions: status is streaming and last llm message has reasoning without action
     Action: render AgentChat
     Assertions: only active llm message receives isReasoningStreaming=true
     Requirements: llm-integration.2, llm-integration.7.2 */
  it('should mark only active reasoning message as streaming', () => {
    mockUseAgentChatState.isStreaming = true;
    mockUseAgentChatState.rawMessages = [
      makeMessage(1, 'user'),
      {
        ...makeMessage(2, 'llm'),
        payload: { data: { reasoning: { text: 'Thinking' } } },
      },
      makeMessage(3, 'user'),
    ];

    render(<AgentChat {...defaultProps} />);

    const rendered = screen.getAllByTestId('agent-message');
    expect(rendered).toHaveLength(3);
    expect(rendered[0]).toHaveAttribute('data-reasoning-streaming', 'false');
    expect(rendered[1]).toHaveAttribute('data-reasoning-streaming', 'true');
    expect(rendered[2]).toHaveAttribute('data-reasoning-streaming', 'false');
  });

  /* Preconditions: status is streaming but llm message already has final text
     Action: render AgentChat
     Assertions: reasoning streaming flag is false (streaming reasoning is finished)
     Requirements: llm-integration.7.3 */
  it('should not mark llm message as reasoning-streaming when text is already present', () => {
    mockUseAgentChatState.isStreaming = true;
    mockUseAgentChatState.rawMessages = [
      makeMessage(1, 'user'),
      {
        ...makeMessage(2, 'llm'),
        payload: {
          data: {
            reasoning: { text: 'Thinking' },
            text: 'Done',
          },
        },
      },
    ];

    render(<AgentChat {...defaultProps} />);

    const rendered = screen.getAllByTestId('agent-message');
    expect(rendered).toHaveLength(2);
    expect(rendered[1]).toHaveAttribute('data-reasoning-streaming', 'false');
  });

  /* Preconditions: status is streaming and latest llm message has no text yet (done=false)
     Action: render AgentChat
     Assertions: llm message receives isReasoningStreaming=true even before first reasoning delta
     Requirements: llm-integration.2, llm-integration.7.2 */
  it('should mark in-flight llm without text as reasoning-streaming', () => {
    mockUseAgentChatState.isStreaming = true;
    mockUseAgentChatState.rawMessages = [
      makeMessage(1, 'user'),
      {
        ...makeMessage(2, 'llm'),
        payload: { data: {} },
        done: false,
      },
    ];

    render(<AgentChat {...defaultProps} />);

    const rendered = screen.getAllByTestId('agent-message');
    expect(rendered).toHaveLength(2);
    expect(rendered[1]).toHaveAttribute('data-reasoning-streaming', 'true');
  });

  /* Preconditions: chat contains persisted messages and user edits prompt input only
     Action: render AgentChat, then change textarea value
     Assertions: existing AgentMessage items are not re-rendered for input-only state changes
     Requirements: llm-integration.14.5, realtime-events.6.2 */
  it('should not re-render message list on prompt input-only updates', async () => {
    mockUseAgentChatState.rawMessages = [makeMessage(1), makeMessage(2)];
    render(<AgentChat {...defaultProps} />);
    expect(mockAgentMessage).toHaveBeenCalledTimes(2);

    await act(async () => {
      fireEvent.change(screen.getByTestId('auto-expanding-textarea'), {
        target: { value: 'Draft text' },
      });
    });

    expect(mockAgentMessage).toHaveBeenCalledTimes(2);
  });

  /* Preconditions: chat has two messages and only one message object changes on update
     Action: re-render AgentChat with the second message updated and first message preserved by reference
     Assertions: only one AgentMessage re-renders
     Requirements: llm-integration.14.5, realtime-events.6.2 */
  it('should re-render only changed message item when one snapshot updates', () => {
    const first = makeMessage(1, 'user');
    const second = makeMessage(2, 'llm');
    mockUseAgentChatState.rawMessages = [first, second];
    const { rerender } = render(<AgentChat {...defaultProps} />);
    expect(mockAgentMessage).toHaveBeenCalledTimes(2);

    mockUseAgentChatState.rawMessages = [
      first,
      {
        ...second,
        payload: { data: { text: 'updated' } },
      },
    ];
    rerender(<AgentChat {...defaultProps} />);

    expect(mockAgentMessage).toHaveBeenCalledTimes(3);
  });
});

describe('AgentChat — send message', () => {
  /* Preconditions: user types text and submits
     Action: change input value, click submit
     Assertions: sendMessage called with trimmed text and input is cleared immediately after submit starts
     Requirements: agents.4.3.1, agents.4.3.2 */
  it('should call sendMessage and clear input on submit', async () => {
    let resolveSend: ((value: boolean) => void) | null = null;
    mockSendMessage.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSend = resolve;
        })
    );
    render(<AgentChat {...defaultProps} />);

    // Type into the controlled input — triggers onChange → setTaskInput
    await act(async () => {
      fireEvent.change(screen.getByTestId('auto-expanding-textarea'), {
        target: { value: 'Hello agent' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('prompt-input-send'));
    });

    expect(mockSendMessage).toHaveBeenCalledWith('Hello agent');
    expect(screen.getByTestId('auto-expanding-textarea')).toHaveValue('');

    await act(async () => {
      resolveSend?.(true);
    });
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
     Requirements: agents.4.3.3 */
  it('should NOT clear input when sendMessage returns false', async () => {
    mockSendMessage.mockResolvedValue(false);
    render(<AgentChat {...defaultProps} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId('auto-expanding-textarea'), {
        target: { value: 'Hello' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('prompt-input-send'));
    });

    expect(screen.getByTestId('auto-expanding-textarea')).toHaveValue('Hello');
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

  /* Preconditions: component rendered with idle input
     Action: inspect PromptInput root classes
     Assertions: usage-level unfocused visibility styling is applied without replacing vendor focus ownership
     Requirements: agents.4.7.4, agents.4.7.5 */
  it('should apply usage-level unfocused input visibility styling', () => {
    render(<AgentChat {...defaultProps} />);

    expect(screen.getByTestId('agent-prompt-input')).toHaveClass(
      'mt-4',
      '[&_[data-slot=input-group]]:border-border/80'
    );
  });

  /* Preconditions: component rendered
     Action: render AgentChat
     Assertions: shortcut hint is rendered inside PromptInput footer content
     Requirements: agents.4.3, agents.4.4, agents.4.7.3 */
  it('should render keyboard shortcut hint inside PromptInput footer', () => {
    render(<AgentChat {...defaultProps} />);

    const promptInput = screen.getByTestId('agent-prompt-input');
    const promptInputFooter = screen.getByTestId('prompt-input-footer');
    const promptInputTools = screen.getByTestId('prompt-input-tools');
    const shortcutHint = screen.getByText('Press Enter to send, Shift+Enter for new line');
    expect(shortcutHint).toBeInTheDocument();
    expect(promptInput).toContainElement(shortcutHint);
    expect(promptInputFooter).not.toHaveClass('pb-5');
    expect(promptInputTools).toHaveClass('items-end');
    expect(shortcutHint).toHaveClass('translate-y-3', 'text-[11px]', 'text-muted-foreground/80');
    expect(shortcutHint).not.toHaveClass('pl-3');
  });

  /* Preconditions: component rendered
     Action: render AgentChat
     Assertions: input area wrapper uses the same horizontal inset as chat content
     Requirements: agents.4.1, agents.4.3 */
  it('should render input area with horizontal chat inset', () => {
    render(<AgentChat {...defaultProps} />);

    expect(screen.getByTestId('agent-chat-input-area')).toHaveClass(
      'px-6',
      'pb-6',
      'overflow-y-auto',
      '[scrollbar-gutter:stable]'
    );
  });

  /* Preconditions: component rendered
     Action: render AgentChat
     Assertions: PromptInput textarea keeps usage-level horizontal padding without custom sizing overrides
     Requirements: agents.4.5, agents.4.6, agents.4.7 */
  it('should keep PromptInput textarea usage-level padding without custom sizing overrides', () => {
    render(<AgentChat {...defaultProps} />);

    expect(screen.getByTestId('auto-expanding-textarea')).toHaveClass('px-3');
    expect(screen.getByTestId('auto-expanding-textarea')).toHaveClass('max-h-32');
    expect(screen.getByTestId('auto-expanding-textarea')).toHaveClass('block');
    expect(screen.getByTestId('auto-expanding-textarea')).toHaveClass('flex-none');
    expect(screen.getByTestId('auto-expanding-textarea')).toHaveClass('[field-sizing:fixed]');
  });

  /* Preconditions: agent status is not in-progress
     Action: render AgentChat
     Assertions: send button is rendered, stop button is not rendered
     Requirements: agents.4.24.1 */
  it('should render send button when agent is not in progress', () => {
    render(<AgentChat {...defaultProps} />);

    expect(screen.getByTestId('prompt-input-send')).toBeInTheDocument();
    expect(screen.queryByTestId('prompt-input-stop')).not.toBeInTheDocument();
  });

  /* Preconditions: agent status is in-progress
     Action: render AgentChat
     Assertions: stop button is rendered, send button is not rendered
     Requirements: agents.4.24.1 */
  it('should render stop button when agent is in progress', () => {
    mockUseAgentChatState.isStreaming = true;
    render(
      <AgentChat {...defaultProps} agent={{ ...defaultProps.agent, status: 'in-progress' }} />
    );

    expect(screen.getByTestId('prompt-input-stop')).toBeInTheDocument();
    expect(screen.queryByTestId('prompt-input-send')).not.toBeInTheDocument();
  });

  /* Preconditions: agent status is in-progress but request is not streaming
     Action: render AgentChat
     Assertions: stop button is still rendered because mode depends only on agent status
     Requirements: agents.4.24 */
  it('should render stop button when agent is in progress even if request is not streaming', () => {
    mockUseAgentChatState.isStreaming = false;
    render(
      <AgentChat {...defaultProps} agent={{ ...defaultProps.agent, status: 'in-progress' }} />
    );

    expect(screen.getByTestId('prompt-input-stop')).toBeInTheDocument();
    expect(screen.queryByTestId('prompt-input-send')).not.toBeInTheDocument();
  });

  /* Preconditions: agent status is not in-progress and input is empty/non-empty
     Action: type text into input
     Assertions: send button is disabled for empty input and enabled for non-empty input
     Requirements: agents.4.2.2 */
  it('should disable send button for empty text and enable for non-empty text', async () => {
    render(<AgentChat {...defaultProps} />);

    const sendButton = screen.getByTestId('prompt-input-send');
    expect(sendButton).toBeDisabled();

    await act(async () => {
      fireEvent.change(screen.getByTestId('auto-expanding-textarea'), {
        target: { value: 'hello' },
      });
    });
    expect(sendButton).toBeEnabled();
  });

  /* Preconditions: agent status is in-progress
     Action: render AgentChat with empty input
     Assertions: stop button stays enabled regardless of input content
     Requirements: agents.4.2.1 */
  it('should keep stop button enabled regardless of input text', async () => {
    render(
      <AgentChat {...defaultProps} agent={{ ...defaultProps.agent, status: 'in-progress' }} />
    );

    const stopButton = screen.getByTestId('prompt-input-stop');
    expect(stopButton).toBeEnabled();

    await act(async () => {
      fireEvent.change(screen.getByTestId('auto-expanding-textarea'), {
        target: { value: '' },
      });
    });
    expect(stopButton).toBeEnabled();
  });
});

describe('AgentChat — textarea autoresize contract', () => {
  /* Preconditions: active chat textarea is rendered
     Action: textarea receives one line and then multiline content
     Assertions: baseline height is kept for up to two lines and grows afterwards
     Requirements: agents.4.5, agents.4.6 */
  it('should keep two-line baseline and grow after third line', async () => {
    render(<AgentChat {...defaultProps} />);
    const textarea = screen.getByTestId('auto-expanding-textarea') as HTMLTextAreaElement;

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get: () => {
        const lineCount = textarea.value.split('\n').length;
        return lineCount <= 2 ? 64 : lineCount === 3 ? 84 : 104;
      },
    });

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Line 1' } });
    });
    expect(textarea.style.height).toBe('64px');
    expect(textarea.style.overflowY).toBe('hidden');

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Line 1\nLine 2' } });
    });
    expect(textarea.style.height).toBe('64px');
    expect(textarea.style.overflowY).toBe('hidden');

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Line 1\nLine 2\nLine 3' } });
    });
    expect(textarea.style.height).toBe('84px');
    expect(textarea.style.overflowY).toBe('hidden');
  });

  /* Preconditions: active chat textarea is rendered
     Action: textarea receives content above the visible height cap
     Assertions: height is capped and internal scroll is enabled
     Requirements: agents.4.7, agents.4.7.1 */
  it('should cap height and enable internal scroll after visible limit', async () => {
    render(<AgentChat {...defaultProps} />);
    const textarea = screen.getByTestId('auto-expanding-textarea') as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6' },
      });
    });

    expect(textarea.style.height).toBe('124px');
    expect(textarea.style.overflowY).toBe('auto');
  });
});
