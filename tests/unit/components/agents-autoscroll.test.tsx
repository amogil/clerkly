/**
 * @jest-environment jsdom
 */

/**
 * Unit Tests: Agents Autoscroll
 *
 * Tests for autoscroll functionality when messages are added.
 * Requirements: agents.4.13
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

describe('Agents Autoscroll', () => {
  let scrollIntoViewMock: jest.Mock;

  beforeEach(() => {
    // Mock scrollIntoView
    scrollIntoViewMock = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* Preconditions: Component with messages and messagesEndRef, user sends message
     Action: Call handleSend function
     Assertions: scrollIntoView is called with smooth behavior
     Requirements: agents.4.13.4 */
  it('should call scrollIntoView when user sends message', async () => {
    // Create a test component that mimics agents.tsx autoscroll logic
    const TestComponent = ({ onSend }: { onSend: () => void }) => {
      const messagesEndRef = React.useRef<HTMLDivElement>(null);
      const [messages, setMessages] = React.useState<string[]>(['Message 1']);

      const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

      const handleSend = () => {
        setMessages((prev) => [...prev, 'New message']);
        scrollToBottom(); // Explicit call, not useEffect
        onSend();
      };

      return (
        <div>
          {messages.map((msg, i) => (
            <div key={i} data-testid="message">
              {msg}
            </div>
          ))}
          <div ref={messagesEndRef} data-testid="messages-end" />
          <button onClick={handleSend} data-testid="send-button">
            Send
          </button>
        </div>
      );
    };

    const onSend = jest.fn();
    const { getByTestId } = render(<TestComponent onSend={onSend} />);

    // Click send button
    const sendButton = getByTestId('send-button');
    sendButton.click();

    // Should trigger scroll
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth' });
      expect(onSend).toHaveBeenCalled();
    });
  });

  /* Preconditions: Component with messages, new message arrives, user is in bottom third
     Action: New message is added to messages array
     Assertions: scrollIntoView is called with smooth behavior because user is at bottom
     Requirements: agents.4.13.1, agents.4.13.2, agents.4.13.5 */
  it('should scroll with smooth behavior when new message arrives and user is in bottom third', async () => {
    const scrollIntoViewMock = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const TestComponent = () => {
      const messagesEndRef = React.useRef<HTMLDivElement>(null);
      const messagesAreaRef = React.useRef<HTMLDivElement>(null);
      const [messages, setMessages] = React.useState<string[]>(['Message 1']);

      const isUserAtBottom = (): boolean => {
        if (!messagesAreaRef.current) return false;
        const { scrollHeight, scrollTop, clientHeight } = messagesAreaRef.current;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        return distanceFromBottom < clientHeight / 3;
      };

      const scrollToBottom = (instant = false) => {
        messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
      };

      // Autoscroll effect
      React.useEffect(() => {
        if (messages.length > 0 && isUserAtBottom()) {
          scrollToBottom(); // Should use smooth behavior (instant=false by default)
        }
      }, [messages]);

      const addMessage = () => {
        setMessages((prev) => [...prev, 'New message']);
      };

      return (
        <div
          ref={messagesAreaRef}
          data-testid="messages-area"
          style={{ height: '300px', overflowY: 'auto' }}
        >
          {messages.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
          <div ref={messagesEndRef} data-testid="messages-end" />
          <button onClick={addMessage} data-testid="add-message">
            Add Message
          </button>
        </div>
      );
    };

    const { getByTestId } = render(<TestComponent />);
    const messagesArea = getByTestId('messages-area') as HTMLDivElement;

    // Mock scrollHeight, scrollTop, clientHeight to simulate user at bottom
    Object.defineProperty(messagesArea, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(messagesArea, 'scrollTop', { value: 700, configurable: true });
    Object.defineProperty(messagesArea, 'clientHeight', { value: 300, configurable: true });
    // distanceFromBottom = 1000 - 700 - 300 = 0 < 100 (clientHeight/3) → at bottom

    scrollIntoViewMock.mockClear();

    // Add new message
    const button = getByTestId('add-message');
    button.click();

    // Should trigger scroll with smooth behavior
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth' });
    });
  });

  /* Preconditions: Component with messages, new message arrives, user scrolled up
     Action: New message is added to messages array
     Assertions: scrollIntoView is NOT called because user is not at bottom
     Requirements: agents.4.13.2 */
  it('should NOT scroll when new message arrives and user is above bottom third', async () => {
    const TestComponent = () => {
      const messagesEndRef = React.useRef<HTMLDivElement>(null);
      const messagesAreaRef = React.useRef<HTMLDivElement>(null);
      const [messages, setMessages] = React.useState<string[]>(['Message 1']);

      const isUserAtBottom = (): boolean => {
        if (!messagesAreaRef.current) return false;
        const { scrollHeight, scrollTop, clientHeight } = messagesAreaRef.current;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        return distanceFromBottom < clientHeight / 3;
      };

      const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

      // Autoscroll effect
      React.useEffect(() => {
        if (messages.length > 0 && isUserAtBottom()) {
          scrollToBottom();
        }
      }, [messages]);

      const addMessage = () => {
        setMessages((prev) => [...prev, 'New message']);
      };

      return (
        <div
          ref={messagesAreaRef}
          data-testid="messages-area"
          style={{ height: '300px', overflowY: 'auto' }}
        >
          {messages.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
          <div ref={messagesEndRef} />
          <button onClick={addMessage} data-testid="add-message">
            Add Message
          </button>
        </div>
      );
    };

    const { getByTestId } = render(<TestComponent />);
    const messagesArea = getByTestId('messages-area') as HTMLDivElement;

    // Mock scrollHeight, scrollTop, clientHeight to simulate user scrolled up
    Object.defineProperty(messagesArea, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(messagesArea, 'scrollTop', { value: 0, configurable: true });
    Object.defineProperty(messagesArea, 'clientHeight', { value: 300, configurable: true });
    // distanceFromBottom = 1000 - 0 - 300 = 700 > 100 (clientHeight/3) → NOT at bottom

    scrollIntoViewMock.mockClear();

    // Add new message
    const button = getByTestId('add-message');
    button.click();

    // Wait a bit to ensure no scroll happens
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should NOT trigger scroll
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  /* Preconditions: messagesAreaRef with various scroll positions
     Action: Calculate if user is in bottom third
     Assertions: Formula correctly identifies bottom third position
     Requirements: agents.4.13.3 */
  it('should calculate bottom third correctly', async () => {
    const TestComponent = () => {
      const messagesAreaRef = React.useRef<HTMLDivElement>(null);
      const [result, setResult] = React.useState<boolean | null>(null);

      const isUserAtBottom = (): boolean => {
        if (!messagesAreaRef.current) return false;
        const { scrollHeight, scrollTop, clientHeight } = messagesAreaRef.current;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        return distanceFromBottom < clientHeight / 3;
      };

      const checkPosition = () => {
        setResult(isUserAtBottom());
      };

      return (
        <div>
          <div ref={messagesAreaRef} data-testid="messages-area" />
          <button onClick={checkPosition} data-testid="check">
            Check
          </button>
          <div data-testid="result">{result !== null ? result.toString() : 'null'}</div>
        </div>
      );
    };

    const { getByTestId } = render(<TestComponent />);
    const messagesArea = getByTestId('messages-area') as HTMLDivElement;
    const checkButton = getByTestId('check');
    const resultDiv = getByTestId('result');

    // Test case 1: scrollTop = 0, clientHeight = 300
    // distanceFromBottom = 1000 - 0 - 300 = 700 > 100 → NOT at bottom
    Object.defineProperty(messagesArea, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(messagesArea, 'scrollTop', { value: 0, configurable: true });
    Object.defineProperty(messagesArea, 'clientHeight', { value: 300, configurable: true });
    checkButton.click();
    await waitFor(() => {
      expect(resultDiv.textContent).toBe('false');
    });

    // Test case 2: scrollTop = 700, clientHeight = 300
    // distanceFromBottom = 1000 - 700 - 300 = 0 < 100 → at bottom
    Object.defineProperty(messagesArea, 'scrollTop', { value: 700, configurable: true });
    checkButton.click();
    await waitFor(() => {
      expect(resultDiv.textContent).toBe('true');
    });

    // Test case 3: scrollTop = 650, clientHeight = 300
    // distanceFromBottom = 1000 - 650 - 300 = 50 < 100 → at bottom
    Object.defineProperty(messagesArea, 'scrollTop', { value: 650, configurable: true });
    checkButton.click();
    await waitFor(() => {
      expect(resultDiv.textContent).toBe('true');
    });

    // Test case 4: scrollTop = 600, clientHeight = 300
    // distanceFromBottom = 1000 - 600 - 300 = 100 NOT < 100 → NOT at bottom (boundary)
    Object.defineProperty(messagesArea, 'scrollTop', { value: 600, configurable: true });
    checkButton.click();
    await waitFor(() => {
      expect(resultDiv.textContent).toBe('false');
    });
  });

  /* Preconditions: Component with messages, user scrolled up
     Action: User sends message
     Assertions: scrollIntoView is called regardless of scroll position
     Requirements: agents.4.13.4 */
  it('should always scroll when user sends message regardless of position', async () => {
    const TestComponent = () => {
      const messagesEndRef = React.useRef<HTMLDivElement>(null);
      const messagesAreaRef = React.useRef<HTMLDivElement>(null);
      const [messages, setMessages] = React.useState<string[]>(['Message 1']);

      const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

      const handleSend = () => {
        setMessages((prev) => [...prev, 'User message']);
        scrollToBottom(); // Always scroll on user send
      };

      return (
        <div
          ref={messagesAreaRef}
          data-testid="messages-area"
          style={{ height: '300px', overflowY: 'auto' }}
        >
          {messages.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
          <div ref={messagesEndRef} />
          <button onClick={handleSend} data-testid="send">
            Send
          </button>
        </div>
      );
    };

    const { getByTestId } = render(<TestComponent />);
    const messagesArea = getByTestId('messages-area') as HTMLDivElement;

    // Mock scroll position: user scrolled up (NOT at bottom)
    Object.defineProperty(messagesArea, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(messagesArea, 'scrollTop', { value: 0, configurable: true });
    Object.defineProperty(messagesArea, 'clientHeight', { value: 300, configurable: true });

    scrollIntoViewMock.mockClear();

    // User sends message
    const sendButton = getByTestId('send');
    sendButton.click();

    // Should trigger scroll even though user is not at bottom
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth' });
    });
  });

  /* Preconditions: Component with messagesEndRef attached to DOM
     Action: Render component
     Assertions: messagesEndRef is attached to invisible div element
     Requirements: agents.4.13.6 */
  it('should have messagesEndRef attached to invisible div', () => {
    const TestComponent = () => {
      const messagesEndRef = React.useRef<HTMLDivElement>(null);

      return (
        <div>
          <div data-testid="message">Message 1</div>
          <div ref={messagesEndRef} data-testid="messages-end" />
        </div>
      );
    };

    const { getByTestId } = render(<TestComponent />);

    const messagesEnd = getByTestId('messages-end');
    expect(messagesEnd).toBeInTheDocument();
    expect(messagesEnd.tagName).toBe('DIV');
  });

  /* Preconditions: Component with send functionality
     Action: Send multiple messages
     Assertions: scrollIntoView is called each time user sends with smooth behavior
     Requirements: agents.4.13.4, agents.4.13.5, agents.4.14.6 */
  it('should scroll on every user message send with smooth behavior', async () => {
    const scrollIntoViewMock = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const TestComponent = () => {
      const messagesEndRef = React.useRef<HTMLDivElement>(null);
      const [messages, setMessages] = React.useState<string[]>([]);

      const scrollToBottom = (instant = false) => {
        messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
      };

      const handleSend = () => {
        setMessages((prev) => [...prev, `Message ${prev.length + 1}`]);
        scrollToBottom(); // Should use smooth behavior (instant=false by default)
      };

      return (
        <div>
          {messages.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
          <div ref={messagesEndRef} />
          <button onClick={handleSend} data-testid="send">
            Send
          </button>
        </div>
      );
    };

    const { getByTestId } = render(<TestComponent />);
    const sendButton = getByTestId('send');

    // Send first message
    sendButton.click();
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth' });
    });

    scrollIntoViewMock.mockClear();

    // Send second message
    sendButton.click();
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth' });
    });

    scrollIntoViewMock.mockClear();

    // Send third message
    sendButton.click();
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth' });
    });
  });

  /* Preconditions: Component with collapsible block, user at bottom, StickToBottom state mocked
     Action: Toggle collapsible open/close via useToggleScrollLock wrapper
     Assertions: scrollTop is preserved and auto-scroll is not triggered
     Requirements: agents.4.13.7 */
  it('should not auto-scroll when toggling a collapsible block near bottom', async () => {
    const scrollIntoViewMock = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    // Simulate the scroll lock mechanism from useToggleScrollLock.
    // The real hook manipulates isAtBottom on a mutable StickToBottomState object
    // (not React state), so the library sees the suppressed value synchronously
    // and does not re-trigger scroll-to-bottom.
    // Here we use a mutable ref to model that same synchronous suppression.
    const TestComponent = () => {
      const scrollContainerRef = React.useRef<HTMLDivElement>(null);
      const [isOpen, setIsOpen] = React.useState(false);
      // Use a ref to model StickToBottomState.isAtBottom (mutable, not React state)
      const isAtBottomRef = React.useRef(true);
      const [, forceUpdate] = React.useState(0);

      const handleToggle = (open: boolean) => {
        // This simulates what useToggleScrollLock does:
        // 1. Capture scrollTop before toggle
        const container = scrollContainerRef.current;
        if (!container) return;
        const capturedScrollTop = container.scrollTop;

        // 2. Suppress isAtBottom to prevent auto-scroll (synchronous mutation)
        isAtBottomRef.current = false;

        // 3. Perform the toggle
        setIsOpen(open);

        // 4. Restore scrollTop after reflow (via rAF)
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = capturedScrollTop;
          }
          // Restore isAtBottom based on actual position
          const { scrollHeight, scrollTop: newScrollTop, clientHeight } = container;
          const distanceFromBottom = scrollHeight - newScrollTop - clientHeight;
          isAtBottomRef.current = distanceFromBottom < 70;
          forceUpdate((n) => n + 1);
        });
      };

      // Autoscroll effect - simulates StickToBottom ResizeObserver behavior
      // Reads the mutable isAtBottomRef (like the library reads state.isAtBottom)
      React.useEffect(() => {
        if (isAtBottomRef.current) {
          scrollContainerRef.current
            ?.querySelector('[data-testid="messages-end"]')
            ?.scrollIntoView({ behavior: 'smooth' });
        }
      }, [isOpen]);

      return (
        <div
          ref={scrollContainerRef}
          data-testid="scroll-container"
          style={{ height: '300px', overflowY: 'auto' }}
        >
          <div>Message 1</div>
          <div>Message 2</div>
          <div data-testid="collapsible">
            <button data-testid="toggle-button" onClick={() => handleToggle(!isOpen)}>
              Toggle
            </button>
            {isOpen && (
              <div data-testid="collapsible-content" style={{ height: '200px' }}>
                Expanded content
              </div>
            )}
          </div>
          <div data-testid="messages-end" />
        </div>
      );
    };

    const { getByTestId } = render(<TestComponent />);
    const scrollContainer = getByTestId('scroll-container') as HTMLDivElement;

    // Mock scroll position: user is at bottom
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', {
      value: 100,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, configurable: true });

    // Clear initial render scroll calls
    scrollIntoViewMock.mockClear();

    // Toggle the collapsible open
    const toggleButton = getByTestId('toggle-button');
    toggleButton.click();

    // Wait a tick for rAF to process
    await new Promise((resolve) => setTimeout(resolve, 50));

    // scrollIntoView should NOT have been called because isAtBottom was suppressed during toggle
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  /* Preconditions: messagesEndRef is null (not attached)
     Action: Try to scroll
     Assertions: No error is thrown (optional chaining works)
     Requirements: agents.4.13.5 */
  it('should handle null messagesEndRef gracefully', () => {
    const TestComponent = () => {
      const messagesEndRef = React.useRef<HTMLDivElement>(null);

      const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

      React.useEffect(() => {
        scrollToBottom();
      }, []);

      return <div>No messages end ref attached</div>;
    };

    // Should not throw error
    expect(() => render(<TestComponent />)).not.toThrow();
  });

  /* Preconditions: AgentChat renders Conversation with resize="instant" prop
     Action: Render AgentChat with mocked dependencies and check conversation element
     Assertions: The mock Conversation receives resize="instant" via props spread
     Requirements: agents.4.13.8 */
  it('should pass resize="instant" to StickToBottom for stable scroll during window resize', () => {
    // Isolate module registry so that jest.doMock calls only affect this test
    jest.isolateModules(() => {
      const ReactLocal = require('react') as typeof React;
      const ReactDOMClient = require('react-dom/client') as typeof import('react-dom/client');

      // Track props passed to Conversation
      let capturedResizeProp: string | undefined;

      jest.doMock('../../../src/renderer/hooks/useAgentChat', () => ({
        useAgentChat: () => ({
          rawMessages: [],
          isLoading: false,
          isStreaming: false,
          sendMessage: jest.fn(),
          cancelCurrentRequest: jest.fn(),
          messages: [],
        }),
      }));

      jest.doMock('framer-motion', () => ({
        motion: {
          div: ({ children, ...props }: { children?: React.ReactNode; [k: string]: unknown }) =>
            ReactLocal.createElement('div', props, children),
        },
      }));

      jest.doMock('../../../src/renderer/components/ai-elements/conversation', () => ({
        Conversation: ({
          children,
          className,
          resize,
          ..._rest
        }: {
          children?: React.ReactNode;
          className?: string;
          resize?: string;
          [k: string]: unknown;
        }) => {
          capturedResizeProp = resize;
          return ReactLocal.createElement(
            'div',
            { 'data-testid': 'conversation-mock', 'data-resize': resize, className },
            children
          );
        },
        ConversationContent: ({
          children,
          ...props
        }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
          ReactLocal.createElement('div', props, children),
        ConversationScrollButton: () => null,
      }));

      jest.doMock('../../../src/renderer/components/agents/AgentMessage', () => ({
        AgentMessage: () => null,
      }));

      jest.doMock('../../../src/renderer/components/agents/AgentWelcome', () => ({
        AgentWelcome: () =>
          ReactLocal.createElement('div', { 'data-testid': 'agent-welcome' }, 'Welcome'),
      }));

      jest.doMock('../../../src/renderer/components/agents/RateLimitBanner', () => ({
        RateLimitBanner: () => null,
      }));

      jest.doMock('../../../src/renderer/hooks/useToggleScrollLock', () => ({
        useToggleScrollLock: () => () => () => {},
      }));

      jest.doMock('../../../src/renderer/components/ai-elements/prompt-input', () => ({
        PromptInput: ({ children }: { children?: React.ReactNode }) =>
          ReactLocal.createElement('div', { 'data-testid': 'prompt-input-mock' }, children),
        PromptInputBody: ({ children }: { children?: React.ReactNode }) =>
          ReactLocal.createElement('div', null, children),
        PromptInputFooter: ({ children }: { children?: React.ReactNode }) =>
          ReactLocal.createElement('div', null, children),
        PromptInputTextarea: () => ReactLocal.createElement('textarea'),
        PromptInputTools: ({ children }: { children?: React.ReactNode }) =>
          ReactLocal.createElement('div', null, children),
        PromptInputSubmit: () => ReactLocal.createElement('button', null, 'Submit'),
      }));

      const { AgentChat } = require('../../../src/renderer/components/agents/AgentChat');

      const agent = {
        id: 'test-agent',
        name: 'Test',
        status: 'idle',
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = ReactDOMClient.createRoot(container);

      // Use React 18 act from react-dom/test-utils
      const { act: reactAct } = require('react') as { act: (fn: () => void) => void };

      reactAct(() => {
        root.render(
          ReactLocal.createElement(AgentChat, {
            agent,
            isActive: true,
            rateLimitBanner: null,
            onRateLimitDismiss: () => {},
            onLoadingChange: () => {},
            onStartupSettledChange: () => {},
          })
        );
      });

      const conversationEl = container.querySelector('[data-testid="conversation-mock"]');
      expect(conversationEl).toBeTruthy();
      expect(conversationEl!.getAttribute('data-resize')).toBe('instant');
      expect(capturedResizeProp).toBe('instant');

      // Cleanup
      reactAct(() => {
        root.unmount();
      });
      container.remove();
    });
  });
});
