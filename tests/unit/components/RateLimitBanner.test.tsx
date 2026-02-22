/**
 * @jest-environment jsdom
 */

// Requirements: llm-integration.3.7
// Unit tests for RateLimitBanner component

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock window.api
const mockRetryLast = jest.fn().mockResolvedValue({ success: true });
const mockCancelRetry = jest.fn().mockResolvedValue({ success: true });

// In jsdom, window === global, so we can set api directly
(window as any).api = {
  messages: {
    retryLast: mockRetryLast,
    cancelRetry: mockCancelRetry,
  },
};
// Mock DateTimeFormatter
jest.mock('../../../src/renderer/utils/DateTimeFormatter', () => ({
  DateTimeFormatter: {
    formatLogTimestamp: (date: Date) => date.toISOString(),
    formatDateTime: (date: Date) => date.toISOString(),
  },
}));

import { RateLimitBanner } from '../../../src/renderer/components/agents/RateLimitBanner';

describe('RateLimitBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /* Preconditions: RateLimitBanner rendered with retryAfterSeconds=5
     Action: Component mounts
     Assertions: Banner visible with countdown text and Cancel button
     Requirements: llm-integration.3.7.2 */
  it('should render with countdown text and cancel button', () => {
    const onDismiss = jest.fn();
    render(
      <RateLimitBanner
        agentId="agent-1"
        userMessageId={42}
        retryAfterSeconds={5}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByTestId('rate-limit-banner')).toBeInTheDocument();
    expect(screen.getByText(/Rate limit exceeded/)).toBeInTheDocument();
    expect(screen.getByText(/5 seconds/)).toBeInTheDocument();
    expect(screen.getByTestId('rate-limit-cancel')).toBeInTheDocument();
  });

  /* Preconditions: RateLimitBanner rendered with retryAfterSeconds=3
     Action: 3 seconds pass
     Assertions: retryLast called, onDismiss called
     Requirements: llm-integration.3.7.3 */
  it('should auto-retry when countdown reaches zero', async () => {
    const onDismiss = jest.fn();
    render(
      <RateLimitBanner
        agentId="agent-1"
        userMessageId={42}
        retryAfterSeconds={3}
        onDismiss={onDismiss}
      />
    );

    // Advance 1 second at a time to trigger each useEffect re-render
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockRetryLast).toHaveBeenCalledWith('agent-1', 42);
    expect(onDismiss).toHaveBeenCalled();
  });

  /* Preconditions: RateLimitBanner rendered
     Action: User clicks Cancel
     Assertions: cancelRetry called, onDismiss called
     Requirements: llm-integration.3.7.4 */
  it('should call cancelRetry and dismiss on Cancel click', async () => {
    const onDismiss = jest.fn();
    render(
      <RateLimitBanner
        agentId="agent-1"
        userMessageId={42}
        retryAfterSeconds={10}
        onDismiss={onDismiss}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('rate-limit-cancel'));
    });

    expect(mockCancelRetry).toHaveBeenCalledWith('agent-1', 42);
    expect(onDismiss).toHaveBeenCalled();
  });

  /* Preconditions: RateLimitBanner rendered with retryAfterSeconds=2
     Action: 1 second passes
     Assertions: Countdown shows 1 second remaining
     Requirements: llm-integration.3.7.2 */
  it('should decrement countdown each second', async () => {
    const onDismiss = jest.fn();
    render(
      <RateLimitBanner
        agentId="agent-1"
        userMessageId={42}
        retryAfterSeconds={2}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText(/2 seconds/)).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/1 second/)).toBeInTheDocument();
  });
});
