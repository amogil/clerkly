/**
 * @jest-environment jsdom
 */

// Requirements: agents.6, agents.8.1, agents.5.3
// Unit tests for Agents component status text colors

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { getStatusStyles, getStatusText } from '../../../src/shared/utils/agentStatus';
import type { AgentStatus } from '../../../src/shared/utils/agentStatus';

describe('Agents Component - Status Text Colors', () => {
  /* Preconditions: Status text element with 'new' status
     Action: Render status text with getStatusStyles
     Assertions: Has text-sky-600 class
     Requirements: agents.6.1, agents.8.1, agents.5.3 */
  it('should apply text-sky-600 class for new status', () => {
    const status: AgentStatus = 'new';
    const styles = getStatusStyles(status);

    const StatusText = () => <span className={styles.text}>{getStatusText(status)}</span>;

    const { container } = render(<StatusText />);
    const span = container.querySelector('span');

    expect(span).toHaveClass('text-sky-600');
    expect(span?.textContent).toBe('New');
  });

  /* Preconditions: Status text element with 'in-progress' status
     Action: Render status text with getStatusStyles
     Assertions: Has text-blue-600 class
     Requirements: agents.6.2, agents.8.1, agents.5.3 */
  it('should apply text-blue-600 class for in-progress status', () => {
    const status: AgentStatus = 'in-progress';
    const styles = getStatusStyles(status);

    const StatusText = () => <span className={styles.text}>{getStatusText(status)}</span>;

    const { container } = render(<StatusText />);
    const span = container.querySelector('span');

    expect(span).toHaveClass('text-blue-600');
    expect(span?.textContent).toBe('In progress');
  });

  /* Preconditions: Status text element with 'awaiting-response' status
     Action: Render status text with getStatusStyles
     Assertions: Has text-amber-600 class
     Requirements: agents.6.3, agents.8.1, agents.5.3 */
  it('should apply text-amber-600 class for awaiting-response status', () => {
    const status: AgentStatus = 'awaiting-response';
    const styles = getStatusStyles(status);

    const StatusText = () => <span className={styles.text}>{getStatusText(status)}</span>;

    const { container } = render(<StatusText />);
    const span = container.querySelector('span');

    expect(span).toHaveClass('text-amber-600');
    expect(span?.textContent).toBe('Awaiting response');
  });

  /* Preconditions: Status text element with 'error' status
     Action: Render status text with getStatusStyles
     Assertions: Has text-red-600 class
     Requirements: agents.6.4, agents.8.1, agents.5.3 */
  it('should apply text-red-600 class for error status', () => {
    const status: AgentStatus = 'error';
    const styles = getStatusStyles(status);

    const StatusText = () => <span className={styles.text}>{getStatusText(status)}</span>;

    const { container } = render(<StatusText />);
    const span = container.querySelector('span');

    expect(span).toHaveClass('text-red-600');
    expect(span?.textContent).toBe('Error');
  });

  /* Preconditions: Status text element with 'completed' status
     Action: Render status text with getStatusStyles
     Assertions: Has text-green-600 class
     Requirements: agents.6.5, agents.8.1, agents.5.3 */
  it('should apply text-green-600 class for completed status', () => {
    const status: AgentStatus = 'completed';
    const styles = getStatusStyles(status);

    const StatusText = () => <span className={styles.text}>{getStatusText(status)}</span>;

    const { container } = render(<StatusText />);
    const span = container.querySelector('span');

    expect(span).toHaveClass('text-green-600');
    expect(span?.textContent).toBe('Completed');
  });

  /* Preconditions: Header with active agent status
     Action: Render header status text as in agents.tsx
     Assertions: Status text has correct color class
     Requirements: agents.8.1 */
  it('should render header status text with correct color class', () => {
    const status: AgentStatus = 'in-progress';
    const styles = getStatusStyles(status);

    // Simulate header structure from agents.tsx
    const Header = () => (
      <div className="flex items-center gap-2 text-xs">
        <span className={styles.text}>{getStatusText(status)}</span>
        <span className="text-muted-foreground">·</span>
      </div>
    );

    const { container } = render(<Header />);
    const statusSpan = container.querySelector('span');

    expect(statusSpan).toHaveClass('text-blue-600');
    expect(statusSpan?.textContent).toBe('In progress');
  });

  /* Preconditions: AllAgents page with agent status
     Action: Render agent card status text as in agents.tsx
     Assertions: Status text has correct color class
     Requirements: agents.5.3 */
  it('should render AllAgents status text with correct color class', () => {
    const status: AgentStatus = 'error';
    const styles = getStatusStyles(status);

    // Simulate AllAgents card structure from agents.tsx
    const AgentCard = () => (
      <div className="flex items-center gap-3 text-xs">
        <span className={styles.text}>{getStatusText(status)}</span>
        <div className="text-muted-foreground">
          <span>·</span>
        </div>
      </div>
    );

    const { container } = render(<AgentCard />);
    const statusSpan = container.querySelector('span');

    expect(statusSpan).toHaveClass('text-red-600');
    expect(statusSpan?.textContent).toBe('Error');
  });

  /* Preconditions: Multiple statuses rendered
     Action: Render all status types
     Assertions: Each has unique color class
     Requirements: agents.6, agents.8.1, agents.5.3 */
  it('should render different colors for different statuses', () => {
    const statuses: AgentStatus[] = [
      'new',
      'in-progress',
      'awaiting-response',
      'error',
      'completed',
    ];

    const AllStatuses = () => (
      <>
        {statuses.map((status) => {
          const styles = getStatusStyles(status);
          return (
            <span key={status} className={styles.text} data-status={status}>
              {getStatusText(status)}
            </span>
          );
        })}
      </>
    );

    const { container } = render(<AllStatuses />);

    // Check each status has correct color
    const newStatus = container.querySelector('[data-status="new"]');
    expect(newStatus).toHaveClass('text-sky-600');

    const inProgressStatus = container.querySelector('[data-status="in-progress"]');
    expect(inProgressStatus).toHaveClass('text-blue-600');

    const awaitingStatus = container.querySelector('[data-status="awaiting-response"]');
    expect(awaitingStatus).toHaveClass('text-amber-600');

    const errorStatus = container.querySelector('[data-status="error"]');
    expect(errorStatus).toHaveClass('text-red-600');

    const completedStatus = container.querySelector('[data-status="completed"]');
    expect(completedStatus).toHaveClass('text-green-600');
  });

  /* Preconditions: Status text with additional classes
     Action: Render status text with other classes
     Assertions: Color class is preserved alongside other classes
     Requirements: agents.8.1, agents.5.3 */
  it('should preserve color class when combined with other classes', () => {
    const status: AgentStatus = 'awaiting-response';
    const styles = getStatusStyles(status);

    const StatusWithExtraClasses = () => (
      <span className={`${styles.text} font-bold uppercase`}>{getStatusText(status)}</span>
    );

    const { container } = render(<StatusWithExtraClasses />);
    const span = container.querySelector('span');

    expect(span).toHaveClass('text-amber-600');
    expect(span).toHaveClass('font-bold');
    expect(span).toHaveClass('uppercase');
  });

  /* Preconditions: Status changes dynamically
     Action: Re-render with different status
     Assertions: Color class updates correctly
     Requirements: agents.6, agents.8.1 */
  it('should update color class when status changes', () => {
    let currentStatus: AgentStatus = 'new';

    const DynamicStatus = ({ status }: { status: AgentStatus }) => {
      const styles = getStatusStyles(status);
      return <span className={styles.text}>{getStatusText(status)}</span>;
    };

    const { container, rerender } = render(<DynamicStatus status={currentStatus} />);
    let span = container.querySelector('span');

    // Initial status
    expect(span).toHaveClass('text-sky-600');
    expect(span?.textContent).toBe('New');

    // Change to in-progress
    currentStatus = 'in-progress';
    rerender(<DynamicStatus status={currentStatus} />);
    span = container.querySelector('span');
    expect(span).toHaveClass('text-blue-600');
    expect(span?.textContent).toBe('In progress');

    // Change to error
    currentStatus = 'error';
    rerender(<DynamicStatus status={currentStatus} />);
    span = container.querySelector('span');
    expect(span).toHaveClass('text-red-600');
    expect(span?.textContent).toBe('Error');
  });

  /* Preconditions: Status icon with background color
     Action: Render status icon with background
     Assertions: Background color class is applied correctly
     Requirements: agents.6 */
  it('should apply correct background color class for status icon', () => {
    const status: AgentStatus = 'completed';
    const styles = getStatusStyles(status);

    const StatusIcon = () => (
      <div className={`w-10 h-10 rounded-full ${styles.bg} flex items-center justify-center`}>
        <span className="text-white">✓</span>
      </div>
    );

    const { container } = render(<StatusIcon />);
    const icon = container.querySelector('.rounded-full');

    expect(icon).toHaveClass('bg-green-500');
  });

  /* Preconditions: Status with ring animation
     Action: Render status with ring
     Assertions: Ring color class is applied correctly
     Requirements: agents.6 */
  it('should apply correct ring color class for status', () => {
    const status: AgentStatus = 'awaiting-response';
    const styles = getStatusStyles(status);

    const StatusWithRing = () => (
      <div className="relative">
        <div className={`absolute -inset-1 rounded-full ring-2 ${styles.ring} animate-pulse`} />
      </div>
    );

    const { container } = render(<StatusWithRing />);
    const ring = container.querySelector('.ring-2');

    expect(ring).toHaveClass('ring-amber-500/30');
  });

  /* Preconditions: All three style properties (bg, ring, text)
     Action: Render component using all three styles
     Assertions: All three classes are applied correctly
     Requirements: agents.6, agents.8.1, agents.5.3 */
  it('should apply all three style properties correctly', () => {
    const status: AgentStatus = 'error';
    const styles = getStatusStyles(status);

    const CompleteStatus = () => (
      <div>
        <div className={`w-10 h-10 rounded-full ${styles.bg}`} data-testid="icon" />
        <div className={`ring-2 ${styles.ring}`} data-testid="ring" />
        <span className={styles.text} data-testid="text">
          {getStatusText(status)}
        </span>
      </div>
    );

    const { getByTestId } = render(<CompleteStatus />);

    expect(getByTestId('icon')).toHaveClass('bg-red-500');
    expect(getByTestId('ring')).toHaveClass('ring-red-500/30');
    expect(getByTestId('text')).toHaveClass('text-red-600');
  });
});
