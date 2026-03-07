/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentReasoningTrigger } from '../../../../src/renderer/components/agents/AgentReasoningTrigger';

const mockUseReasoning = jest.fn();

jest.mock('../../../../src/renderer/components/logo', () => ({
  Logo: ({ animated }: { animated?: boolean }) => (
    <svg data-testid="reasoning-trigger-logo" data-animated={animated ? 'true' : 'false'} />
  ),
}));

jest.mock('../../../../src/renderer/components/ai-elements/reasoning', () => ({
  ReasoningTrigger: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  useReasoning: () => mockUseReasoning(),
}));

describe('AgentReasoningTrigger', () => {
  beforeEach(() => {
    mockUseReasoning.mockReset();
  });

  /* Preconditions: reasoning is streaming and trigger is open
     Action: render AgentReasoningTrigger
     Assertions: app logo is animated, text is "Thinking...", chevron is expanded
     Requirements: agents.4.11, llm-integration.2, llm-integration.7.2 */
  it('should render streaming composition with animated logo, text and expanded chevron', () => {
    mockUseReasoning.mockReturnValue({
      isStreaming: true,
      isOpen: true,
      duration: undefined,
      setIsOpen: jest.fn(),
    });

    render(<AgentReasoningTrigger />);

    expect(screen.getByTestId('reasoning-trigger-logo')).toHaveAttribute('data-animated', 'true');
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    const chevron = document.querySelector('.lucide-chevron-down');
    expect(chevron).toBeInTheDocument();
    expect(chevron).toHaveClass('rotate-180');
  });

  /* Preconditions: reasoning finished, trigger collapsed, duration is known
     Action: render AgentReasoningTrigger
     Assertions: non-animated logo, duration text, collapsed chevron
     Requirements: agents.4.11, llm-integration.2, llm-integration.7.2 */
  it('should render finished composition with duration text and collapsed chevron', () => {
    mockUseReasoning.mockReturnValue({
      isStreaming: false,
      isOpen: false,
      duration: 5,
      setIsOpen: jest.fn(),
    });

    render(<AgentReasoningTrigger />);

    expect(screen.getByTestId('reasoning-trigger-logo')).toHaveAttribute('data-animated', 'false');
    expect(screen.getByText('Thought for 5 seconds')).toBeInTheDocument();
    const chevron = document.querySelector('.lucide-chevron-down');
    expect(chevron).toBeInTheDocument();
    expect(chevron).toHaveClass('rotate-0');
  });

  /* Preconditions: reasoning finished with undefined duration
     Action: render AgentReasoningTrigger
     Assertions: fallback duration text is shown
     Requirements: agents.4.11, llm-integration.2 */
  it('should render fallback duration text when duration is undefined', () => {
    mockUseReasoning.mockReturnValue({
      isStreaming: false,
      isOpen: true,
      duration: undefined,
      setIsOpen: jest.fn(),
    });

    render(<AgentReasoningTrigger />);

    expect(screen.getByText('Thought for a few seconds')).toBeInTheDocument();
  });

  /* Preconditions: reasoning transitions from active streaming to finished auto-collapsed state
     Action: render trigger, then rerender with streaming=false and isOpen=false
     Assertions: logo animation turns off after reasoning is finished and collapsed
     Requirements: agents.4.11.2 */
  it('should keep logo static after reasoning is finished and collapsed', () => {
    mockUseReasoning.mockReturnValue({
      isStreaming: true,
      isOpen: true,
      duration: undefined,
      setIsOpen: jest.fn(),
    });

    const { rerender } = render(<AgentReasoningTrigger />);
    expect(screen.getByTestId('reasoning-trigger-logo')).toHaveAttribute('data-animated', 'true');

    mockUseReasoning.mockReturnValue({
      isStreaming: false,
      isOpen: false,
      duration: 2,
      setIsOpen: jest.fn(),
    });
    rerender(<AgentReasoningTrigger />);

    expect(screen.getByTestId('reasoning-trigger-logo')).toHaveAttribute('data-animated', 'false');
  });

  /* Preconditions: reasoning is still streaming but trigger is already collapsed
     Action: render AgentReasoningTrigger
     Assertions: logo remains static because active reasoning animation requires open trigger
     Requirements: agents.4.11.2 */
  it('should keep logo static when streaming is true but trigger is collapsed', () => {
    mockUseReasoning.mockReturnValue({
      isStreaming: true,
      isOpen: false,
      duration: 1,
      setIsOpen: jest.fn(),
    });

    render(<AgentReasoningTrigger />);

    expect(screen.getByTestId('reasoning-trigger-logo')).toHaveAttribute('data-animated', 'false');
  });
});
