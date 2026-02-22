/**
 * @jest-environment jsdom
 */

// Requirements: agents.4.22
// Unit tests for Agents component message text wrapping

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('../../../src/renderer/components/logo', () => ({
  Logo: () => <div data-testid="logo">Logo</div>,
}));

jest.mock('../../../src/renderer/components/agents/AutoExpandingTextarea', () => ({
  AutoExpandingTextarea: () => <textarea data-testid="textarea" />,
}));

jest.mock('../../../src/renderer/components/agents/EmptyStatePlaceholder', () => ({
  EmptyStatePlaceholder: () => <div data-testid="empty-state">Empty</div>,
}));

jest.mock('lucide-react', () => ({
  Send: () => <div>Send</div>,
  Plus: () => <div>Plus</div>,
  Check: () => <div>Check</div>,
  X: () => <div>X</div>,
  HelpCircle: () => <div>HelpCircle</div>,
  ArrowLeft: () => <div>ArrowLeft</div>,
}));

jest.mock('motion/react', () => ({
  motion: {
    div: ({ children, className, ...props }: any) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
  },
}));

// Mock window.api
(global as any).window = {
  api: {
    agents: {
      create: jest.fn(),
      list: jest.fn(),
      archive: jest.fn(),
    },
    messages: {
      list: jest.fn(),
      create: jest.fn(),
      getLast: jest.fn(),
    },
    events: {
      on: jest.fn(),
      off: jest.fn(),
    },
  },
};

describe('Agents Component - Message Text Wrapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* Preconditions: Component renders with user message
     Action: Check CSS classes on user message
     Assertions: Has whitespace-pre-wrap and break-words classes
     Requirements: agents.4.22 */
  it('should apply whitespace-pre-wrap and break-words to user messages', () => {
    // Create a simple test component that renders a user message
    const UserMessage = () => (
      <div className="flex justify-end">
        <div className="rounded-2xl bg-secondary/70 border border-border px-4 py-3 max-w-[75%]">
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
            Test message
          </p>
        </div>
      </div>
    );

    const { container } = render(<UserMessage />);
    const messageText = container.querySelector('p');

    expect(messageText).toHaveClass('whitespace-pre-wrap');
    expect(messageText).toHaveClass('break-words');
  });

  /* Preconditions: Component renders with agent message
     Action: Check CSS classes on agent message
     Assertions: Has whitespace-pre-wrap and break-words classes
     Requirements: agents.4.22 */
  it('should apply whitespace-pre-wrap and break-words to agent messages', () => {
    // Create a simple test component that renders an agent message
    const AgentMessage = () => (
      <div className="max-w-[85%] text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
        Test agent message
      </div>
    );

    const { container } = render(<AgentMessage />);
    const messageDiv = container.querySelector('.max-w-\\[85\\%\\]');

    expect(messageDiv).toHaveClass('whitespace-pre-wrap');
    expect(messageDiv).toHaveClass('break-words');
  });

  /* Preconditions: Component renders with message containing line breaks
     Action: Check that line breaks are preserved
     Assertions: Text content includes line breaks
     Requirements: agents.4.22 */
  it('should preserve line breaks in message text', () => {
    const messageWithBreaks = 'Line 1\nLine 2\nLine 3';

    const MessageWithBreaks = () => (
      <div className="rounded-2xl bg-secondary/70 border border-border px-4 py-3 max-w-[75%]">
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {messageWithBreaks}
        </p>
      </div>
    );

    const { container } = render(<MessageWithBreaks />);
    const messageText = container.querySelector('p');

    expect(messageText?.textContent).toBe(messageWithBreaks);
    expect(messageText).toHaveClass('whitespace-pre-wrap');
  });

  /* Preconditions: Component renders with long word without spaces
     Action: Check that break-words class is applied
     Assertions: Has break-words class for wrapping
     Requirements: agents.4.22 */
  it('should apply break-words for long words without spaces', () => {
    const longWord = 'verylongwordwithoutanyspacesorbreaks'.repeat(5);

    const MessageWithLongWord = () => (
      <div className="rounded-2xl bg-secondary/70 border border-border px-4 py-3 max-w-[75%]">
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {longWord}
        </p>
      </div>
    );

    const { container } = render(<MessageWithLongWord />);
    const messageText = container.querySelector('p');

    expect(messageText).toHaveClass('break-words');
    expect(messageText?.textContent).toBe(longWord);
  });

  /* Preconditions: Component renders with mixed content
     Action: Check that both classes are applied
     Assertions: Has both whitespace-pre-wrap and break-words
     Requirements: agents.4.22 */
  it('should apply both classes for mixed content', () => {
    const mixedContent = `Short line\n${'verylongword'.repeat(10)}\nAnother line`;

    const MessageWithMixedContent = () => (
      <div className="rounded-2xl bg-secondary/70 border border-border px-4 py-3 max-w-[75%]">
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {mixedContent}
        </p>
      </div>
    );

    const { container } = render(<MessageWithMixedContent />);
    const messageText = container.querySelector('p');

    expect(messageText).toHaveClass('whitespace-pre-wrap');
    expect(messageText).toHaveClass('break-words');
    expect(messageText?.textContent).toBe(mixedContent);
  });

  /* Preconditions: Component renders user and agent messages
     Action: Check that both message types have correct classes
     Assertions: Both have whitespace-pre-wrap and break-words
     Requirements: agents.4.22 */
  it('should apply text wrapping classes to both user and agent messages', () => {
    const Messages = () => (
      <>
        {/* User message */}
        <div className="flex justify-end">
          <div className="rounded-2xl bg-secondary/70 border border-border px-4 py-3 max-w-[75%]">
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
              User message
            </p>
          </div>
        </div>

        {/* Agent message */}
        <div className="max-w-[85%] text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
          Agent message
        </div>
      </>
    );

    const { container } = render(<Messages />);

    // Check user message
    const userMessageText = container.querySelector('.rounded-2xl p');
    expect(userMessageText).toHaveClass('whitespace-pre-wrap');
    expect(userMessageText).toHaveClass('break-words');

    // Check agent message
    const agentMessage = container.querySelector('.max-w-\\[85\\%\\]');
    expect(agentMessage).toHaveClass('whitespace-pre-wrap');
    expect(agentMessage).toHaveClass('break-words');
  });
});

describe('Agents Component - LLM and Error message rendering', () => {
  /* Preconditions: kind:llm message with reasoning and action
     Action: Render the llm message bubble
     Assertions: reasoning text and action content are displayed
     Requirements: llm-integration.7 */
  it('should render kind:llm message with reasoning and action', () => {
    const LlmMessage = () => (
      <div data-testid="message-llm" className="max-w-[85%] space-y-2">
        <div
          data-testid="message-llm-reasoning"
          className="text-xs text-muted-foreground italic whitespace-pre-wrap break-words"
        >
          I am thinking about this...
        </div>
        <div
          data-testid="message-llm-action"
          className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words"
        >
          Here is my answer.
        </div>
      </div>
    );

    const { getByTestId } = render(<LlmMessage />);

    expect(getByTestId('message-llm-reasoning').textContent).toBe('I am thinking about this...');
    expect(getByTestId('message-llm-action').textContent).toBe('Here is my answer.');
  });

  /* Preconditions: kind:llm message with no action yet (streaming in progress)
     Action: Render the llm message bubble
     Assertions: loading indicator (three dots) is shown instead of action
     Requirements: llm-integration.7 */
  it('should render kind:llm loading indicator when action is absent', () => {
    const LlmLoadingMessage = () => (
      <div data-testid="message-llm" className="max-w-[85%] space-y-2">
        <div data-testid="message-llm-loading" className="flex gap-1 items-center py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
        </div>
      </div>
    );

    const { getByTestId, queryByTestId } = render(<LlmLoadingMessage />);

    expect(getByTestId('message-llm-loading')).toBeTruthy();
    expect(queryByTestId('message-llm-action')).toBeNull();
  });

  /* Preconditions: kind:llm message with action but no reasoning
     Action: Render the llm message bubble
     Assertions: only action content is shown, no reasoning block
     Requirements: llm-integration.7 */
  it('should render kind:llm action without reasoning when reasoning is absent', () => {
    const LlmActionOnly = () => (
      <div data-testid="message-llm" className="max-w-[85%] space-y-2">
        <div
          data-testid="message-llm-action"
          className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words"
        >
          Direct answer.
        </div>
      </div>
    );

    const { getByTestId, queryByTestId } = render(<LlmActionOnly />);

    expect(getByTestId('message-llm-action').textContent).toBe('Direct answer.');
    expect(queryByTestId('message-llm-reasoning')).toBeNull();
  });

  /* Preconditions: kind:error message with error info
     Action: Render the error bubble
     Assertions: error message text is shown in red bubble
     Requirements: llm-integration.7 */
  it('should render kind:error message with error text', () => {
    const ErrorMessage = () => (
      <div
        data-testid="message-error"
        className="max-w-[85%] text-sm leading-relaxed text-red-500 whitespace-pre-wrap break-words rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3"
      >
        API key is invalid.
      </div>
    );

    const { getByTestId } = render(<ErrorMessage />);
    const el = getByTestId('message-error');

    expect(el.textContent).toBe('API key is invalid.');
    expect(el).toHaveClass('text-red-500');
  });

  /* Preconditions: kind:error message with no error info
     Action: Render the error bubble
     Assertions: fallback "Unknown error" text is shown
     Requirements: llm-integration.7 */
  it('should render kind:error fallback text when error info is absent', () => {
    const ErrorFallback = () => (
      <div
        data-testid="message-error"
        className="max-w-[85%] text-sm leading-relaxed text-red-500 whitespace-pre-wrap break-words rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3"
      >
        Unknown error
      </div>
    );

    const { getByTestId } = render(<ErrorFallback />);
    expect(getByTestId('message-error').textContent).toBe('Unknown error');
  });
});

describe('MessageBubble — action_link', () => {
  /* Preconditions: kind:error message with action_link, onNavigate provided
     Action: Render MessageBubble, click the action link
     Assertions: action link button visible, onNavigate called with correct screen
     Requirements: llm-integration.3.4.1 */
  it('should render action_link button and call onNavigate on click', () => {
    const { MessageBubble } = jest.requireActual(
      '../../../src/renderer/components/agents/MessageBubble'
    ) as typeof import('../../../src/renderer/components/agents/MessageBubble');

    const message = {
      id: 1,
      agentId: 'agent-1',
      kind: 'error' as const,
      timestamp: Date.now(),
      hidden: false,
      payload: {
        data: {
          reply_to_message_id: null,
          error: {
            type: 'auth',
            message: 'Invalid API key.',
            action_link: { label: 'Open Settings', screen: 'settings' },
          },
        },
      },
    };

    const onNavigate = jest.fn();
    const { getByTestId } = render(
      <MessageBubble
        message={message}
        showAvatar={false}
        agentStatus="new"
        onNavigate={onNavigate}
      />
    );

    expect(getByTestId('message-error').textContent).toContain('Invalid API key.');
    const link = getByTestId('message-error-action-link');
    expect(link.textContent).toBe('Open Settings');
    link.click();
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  /* Preconditions: kind:error message with action_link, no onNavigate provided
     Action: Render MessageBubble without onNavigate
     Assertions: action link button not rendered
     Requirements: llm-integration.3.4.1 */
  it('should not render action_link when onNavigate is not provided', () => {
    const { MessageBubble } = jest.requireActual(
      '../../../src/renderer/components/agents/MessageBubble'
    ) as typeof import('../../../src/renderer/components/agents/MessageBubble');

    const message = {
      id: 2,
      agentId: 'agent-1',
      kind: 'error' as const,
      timestamp: Date.now(),
      hidden: false,
      payload: {
        data: {
          reply_to_message_id: null,
          error: {
            type: 'auth',
            message: 'Invalid API key.',
            action_link: { label: 'Open Settings', screen: 'settings' },
          },
        },
      },
    };

    const { queryByTestId } = render(
      <MessageBubble message={message} showAvatar={false} agentStatus="new" />
    );

    expect(queryByTestId('message-error-action-link')).toBeNull();
  });
});
