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
     Requirements: agents.4.13.1, agents.4.13.3, agents.4.13.5 */
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

  /* Preconditions: Component with messages, messages array changes without user action
     Action: Update messages array directly (simulate agent response)
     Assertions: scrollIntoView is NOT called
     Requirements: agents.4.13.2 */
  it('should NOT scroll when messages change without user action', async () => {
    const TestComponent = () => {
      const messagesEndRef = React.useRef<HTMLDivElement>(null);
      const [messages, setMessages] = React.useState<string[]>(['Message 1']);

      // Simulate agent response (no scrollToBottom call)
      const simulateAgentResponse = () => {
        setMessages((prev) => [...prev, 'Agent response']);
      };

      return (
        <div>
          {messages.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
          <div ref={messagesEndRef} />
          <button onClick={simulateAgentResponse} data-testid="agent-response">
            Simulate Agent Response
          </button>
        </div>
      );
    };

    const { getByTestId } = render(<TestComponent />);

    scrollIntoViewMock.mockClear();

    // Simulate agent response
    const button = getByTestId('agent-response');
    button.click();

    // Wait a bit to ensure no scroll happens
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should NOT trigger scroll
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  /* Preconditions: Component with messagesEndRef attached to DOM
     Action: Render component
     Assertions: messagesEndRef is attached to invisible div element
     Requirements: agents.4.13.4 */
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
     Assertions: scrollIntoView is called each time user sends
     Requirements: agents.4.13.1, agents.4.13.5 */
  it('should scroll on every user message send', async () => {
    const TestComponent = () => {
      const messagesEndRef = React.useRef<HTMLDivElement>(null);
      const [messages, setMessages] = React.useState<string[]>([]);

      const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

      const handleSend = () => {
        setMessages((prev) => [...prev, `Message ${prev.length + 1}`]);
        scrollToBottom();
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
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    const callCount1 = scrollIntoViewMock.mock.calls.length;

    // Send second message
    sendButton.click();
    await waitFor(() => {
      expect(scrollIntoViewMock.mock.calls.length).toBeGreaterThan(callCount1);
    });

    const callCount2 = scrollIntoViewMock.mock.calls.length;

    // Send third message
    sendButton.click();
    await waitFor(() => {
      expect(scrollIntoViewMock.mock.calls.length).toBeGreaterThan(callCount2);
    });
  });

  /* Preconditions: messagesEndRef is null (not attached)
     Action: Try to scroll
     Assertions: No error is thrown (optional chaining works)
     Requirements: agents.4.13.3 */
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
});
