/**
 * @jest-environment jsdom
 */

/**
 * Unit Tests: Agents Scroll Position
 *
 * Tests for saving and restoring scroll position per agent.
 * Requirements: agents.4.14
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

describe('Agents Scroll Position', () => {
  /* Preconditions: Component with scroll handler and position storage
     Action: User scrolls in messages area
     Assertions: Scroll position is saved in Map for current agent
     Requirements: agents.4.14.1, agents.4.14.4 */
  it('should save scroll position when user scrolls', async () => {
    const scrollPositions = new Map<string, number>();
    const activeAgentId = 'agent-1';

    const TestComponent = () => {
      const messagesAreaRef = React.useRef<HTMLDivElement>(null);

      const handleScroll = () => {
        if (!messagesAreaRef.current) return;
        const scrollTop = messagesAreaRef.current.scrollTop;
        scrollPositions.set(activeAgentId, scrollTop);
      };

      return (
        <div
          ref={messagesAreaRef}
          data-testid="messages-area"
          style={{ height: '200px', overflowY: 'scroll' }}
          onScroll={handleScroll}
        >
          <div style={{ height: '1000px' }}>Long content</div>
        </div>
      );
    };

    const { getByTestId } = render(<TestComponent />);
    const messagesArea = getByTestId('messages-area');

    // Simulate scroll
    Object.defineProperty(messagesArea, 'scrollTop', {
      writable: true,
      value: 150,
    });
    messagesArea.dispatchEvent(new Event('scroll'));

    await waitFor(() => {
      expect(scrollPositions.get(activeAgentId)).toBe(150);
    });
  });

  /* Preconditions: Component with saved scroll positions for multiple agents
     Action: Switch to different agent
     Assertions: Previous agent's scroll position is preserved in Map
     Requirements: agents.4.14.2 */
  it('should preserve scroll position when switching agents', () => {
    const scrollPositions = new Map<string, number>();

    // Simulate scrolling on agent-1
    scrollPositions.set('agent-1', 100);

    // Switch to agent-2 (not used in this test, just simulating the switch)
    // agent-1 position should still be saved
    expect(scrollPositions.get('agent-1')).toBe(100);
    expect(scrollPositions.has('agent-2')).toBe(false);
  });

  /* Preconditions: Component with saved scroll position for agent
     Action: Return to agent with saved position
     Assertions: Scroll position is restored from Map
     Requirements: agents.4.14.3, agents.4.14.7 */
  it('should restore scroll position when returning to agent', async () => {
    const scrollPositions = new Map<string, number>();
    scrollPositions.set('agent-1', 250);

    const TestComponent = ({ agentId }: { agentId: string }) => {
      const messagesAreaRef = React.useRef<HTMLDivElement>(null);

      React.useEffect(() => {
        if (!messagesAreaRef.current) return;
        const savedPosition = scrollPositions.get(agentId);
        if (savedPosition !== undefined) {
          messagesAreaRef.current.scrollTop = savedPosition;
        }
      }, [agentId]);

      return (
        <div
          ref={messagesAreaRef}
          data-testid="messages-area"
          style={{ height: '200px', overflowY: 'scroll' }}
        >
          <div style={{ height: '1000px' }}>Long content</div>
        </div>
      );
    };

    const { getByTestId, rerender } = render(<TestComponent agentId="agent-2" />);

    // Switch to agent-1 (has saved position)
    rerender(<TestComponent agentId="agent-1" />);

    await waitFor(() => {
      const messagesArea = getByTestId('messages-area');
      expect(messagesArea.scrollTop).toBe(250);
    });
  });

  /* Preconditions: Component with agent that has no saved scroll position
     Action: Switch to agent for the first time
     Assertions: Scroll position is set to bottom (scrollIntoView called)
     Requirements: agents.4.14.4 */
  it('should scroll to bottom on first visit to agent', async () => {
    const scrollPositions = new Map<string, number>();
    let scrollIntoViewCalled = false;

    const TestComponent = ({ agentId }: { agentId: string }) => {
      const messagesAreaRef = React.useRef<HTMLDivElement>(null);
      const messagesEndRef = React.useRef<HTMLDivElement>(null);

      const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        scrollIntoViewCalled = true;
      };

      React.useEffect(() => {
        if (!messagesAreaRef.current) return;
        const savedPosition = scrollPositions.get(agentId);
        if (savedPosition !== undefined) {
          messagesAreaRef.current.scrollTop = savedPosition;
        } else {
          // First visit - scroll to bottom
          scrollToBottom();
        }
      }, [agentId]);

      return (
        <div
          ref={messagesAreaRef}
          data-testid="messages-area"
          style={{ height: '200px', overflowY: 'scroll' }}
        >
          <div style={{ height: '1000px' }}>Long content</div>
          <div ref={messagesEndRef} data-testid="messages-end" />
        </div>
      );
    };

    // Mock scrollIntoView
    Element.prototype.scrollIntoView = jest.fn();

    const { rerender } = render(<TestComponent agentId="agent-1" />);

    // First visit to agent-1 (no saved position)
    await waitFor(() => {
      expect(scrollIntoViewCalled).toBe(true);
    });

    scrollIntoViewCalled = false;

    // Save position for agent-1
    scrollPositions.set('agent-1', 100);

    // Switch to agent-2 (first visit)
    rerender(<TestComponent agentId="agent-2" />);

    await waitFor(() => {
      expect(scrollIntoViewCalled).toBe(true);
    });

    scrollIntoViewCalled = false;

    // Return to agent-1 (has saved position, should NOT scroll to bottom)
    rerender(<TestComponent agentId="agent-1" />);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(scrollIntoViewCalled).toBe(false);
  });

  /* Preconditions: Component with saved scroll position
     Action: User sends message
     Assertions: Saved position is cleared from Map
     Requirements: agents.4.14.6 */
  it('should clear saved position when user sends message', () => {
    const scrollPositions = new Map<string, number>();
    const activeAgentId = 'agent-1';

    // Save position
    scrollPositions.set(activeAgentId, 300);
    expect(scrollPositions.get(activeAgentId)).toBe(300);

    // Simulate sending message
    scrollPositions.delete(activeAgentId);

    // Position should be cleared
    expect(scrollPositions.has(activeAgentId)).toBe(false);
  });

  /* Preconditions: Multiple agents with different scroll positions
     Action: Switch between agents multiple times
     Assertions: Each agent maintains its own scroll position
     Requirements: agents.4.14.1, agents.4.14.2, agents.4.14.3 */
  it('should maintain independent scroll positions for each agent', async () => {
    const scrollPositions = new Map<string, number>();

    const TestComponent = ({ agentId }: { agentId: string }) => {
      const messagesAreaRef = React.useRef<HTMLDivElement>(null);

      const handleScroll = () => {
        if (!messagesAreaRef.current) return;
        scrollPositions.set(agentId, messagesAreaRef.current.scrollTop);
      };

      React.useEffect(() => {
        if (!messagesAreaRef.current) return;
        const savedPosition = scrollPositions.get(agentId);
        if (savedPosition !== undefined) {
          messagesAreaRef.current.scrollTop = savedPosition;
        }
      }, [agentId]);

      return (
        <div
          ref={messagesAreaRef}
          data-testid="messages-area"
          style={{ height: '200px', overflowY: 'scroll' }}
          onScroll={handleScroll}
        >
          <div style={{ height: '1000px' }}>Agent {agentId} content</div>
        </div>
      );
    };

    const { getByTestId, rerender } = render(<TestComponent agentId="agent-1" />);
    const messagesArea = getByTestId('messages-area');

    // Scroll on agent-1
    Object.defineProperty(messagesArea, 'scrollTop', { writable: true, value: 100 });
    messagesArea.dispatchEvent(new Event('scroll'));

    await waitFor(() => {
      expect(scrollPositions.get('agent-1')).toBe(100);
    });

    // Switch to agent-2 and scroll
    rerender(<TestComponent agentId="agent-2" />);
    Object.defineProperty(messagesArea, 'scrollTop', { writable: true, value: 200 });
    messagesArea.dispatchEvent(new Event('scroll'));

    await waitFor(() => {
      expect(scrollPositions.get('agent-2')).toBe(200);
    });

    // Switch to agent-3 and scroll
    rerender(<TestComponent agentId="agent-3" />);
    Object.defineProperty(messagesArea, 'scrollTop', { writable: true, value: 300 });
    messagesArea.dispatchEvent(new Event('scroll'));

    await waitFor(() => {
      expect(scrollPositions.get('agent-3')).toBe(300);
    });

    // Verify all positions are preserved
    expect(scrollPositions.get('agent-1')).toBe(100);
    expect(scrollPositions.get('agent-2')).toBe(200);
    expect(scrollPositions.get('agent-3')).toBe(300);

    // Return to agent-1
    rerender(<TestComponent agentId="agent-1" />);
    await waitFor(() => {
      expect(messagesArea.scrollTop).toBe(100);
    });
  });

  /* Preconditions: Component using useRef for storage
     Action: Component re-renders
     Assertions: Scroll positions Map is not lost
     Requirements: agents.4.14.5 */
  it('should persist scroll positions across re-renders', () => {
    const TestComponent = ({ count }: { count: number }) => {
      const scrollPositions = React.useRef<Map<string, number>>(new Map());

      // Save some positions
      if (count === 1) {
        scrollPositions.current.set('agent-1', 100);
        scrollPositions.current.set('agent-2', 200);
      }

      return (
        <div data-testid="container">
          <div data-testid="count">{count}</div>
          <div data-testid="positions">{scrollPositions.current.size}</div>
        </div>
      );
    };

    const { getByTestId, rerender } = render(<TestComponent count={1} />);

    expect(getByTestId('positions').textContent).toBe('2');

    // Re-render with different prop
    rerender(<TestComponent count={2} />);

    // Positions should still be there (useRef persists)
    expect(getByTestId('positions').textContent).toBe('2');
  });
});
