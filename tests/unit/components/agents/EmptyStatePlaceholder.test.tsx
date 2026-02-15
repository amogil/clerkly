/**
 * @jest-environment jsdom
 */

/* Preconditions: EmptyStatePlaceholder component
   Action: render component
   Assertions: correct rendering of empty state UI
   Requirements: agents.4 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EmptyStatePlaceholder } from '../../../../src/renderer/components/agents/EmptyStatePlaceholder';

describe('EmptyStatePlaceholder', () => {
  /* Preconditions: Component rendered
     Action: render EmptyStatePlaceholder
     Assertions: component renders without errors
     Requirements: agents.4 */
  it('should render without errors', () => {
    const { container } = render(<EmptyStatePlaceholder />);
    expect(container).toBeInTheDocument();
  });

  /* Preconditions: Component rendered
     Action: check for heading
     Assertions: heading "Start a conversation" is displayed
     Requirements: agents.4 */
  it('should display heading "Start a conversation"', () => {
    render(<EmptyStatePlaceholder />);
    const heading = screen.getByText('Start a conversation');
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H3');
  });

  /* Preconditions: Component rendered
     Action: check for description text
     Assertions: description text is displayed
     Requirements: agents.4 */
  it('should display description text', () => {
    render(<EmptyStatePlaceholder />);
    const description = screen.getByText(/Ask a question, give a command/i);
    expect(description).toBeInTheDocument();
  });

  /* Preconditions: Component rendered
     Action: check for icon
     Assertions: MessageSquare icon is rendered
     Requirements: agents.4 */
  it('should display MessageSquare icon', () => {
    const { container } = render(<EmptyStatePlaceholder />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  /* Preconditions: Component rendered
     Action: check layout structure
     Assertions: correct flex layout classes are applied
     Requirements: agents.4 */
  it('should have correct layout structure', () => {
    const { container } = render(<EmptyStatePlaceholder />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).toHaveClass('flex-col');
    expect(wrapper).toHaveClass('items-center');
    expect(wrapper).toHaveClass('justify-center');
  });

  /* Preconditions: Component rendered
     Action: check icon container styling
     Assertions: icon container has correct background and size
     Requirements: agents.4 */
  it('should have styled icon container', () => {
    const { container } = render(<EmptyStatePlaceholder />);
    const iconContainer = container.querySelector('.bg-primary\\/10');
    expect(iconContainer).toBeInTheDocument();
    expect(iconContainer).toHaveClass('w-16');
    expect(iconContainer).toHaveClass('h-16');
    expect(iconContainer).toHaveClass('rounded-full');
  });

  /* Preconditions: Component rendered
     Action: check heading styling
     Assertions: heading has correct text size and weight
     Requirements: agents.4 */
  it('should have styled heading', () => {
    render(<EmptyStatePlaceholder />);
    const heading = screen.getByText('Start a conversation');
    expect(heading).toHaveClass('text-lg');
    expect(heading).toHaveClass('font-semibold');
    expect(heading).toHaveClass('text-foreground');
  });

  /* Preconditions: Component rendered
     Action: check description styling
     Assertions: description has correct text size and color
     Requirements: agents.4 */
  it('should have styled description', () => {
    render(<EmptyStatePlaceholder />);
    const description = screen.getByText(/Ask a question, give a command/i);
    expect(description).toHaveClass('text-sm');
    expect(description).toHaveClass('text-muted-foreground');
    expect(description).toHaveClass('max-w-md');
  });

  /* Preconditions: Component rendered
     Action: check complete text content
     Assertions: all expected text is present
     Requirements: agents.4 */
  it('should display complete text content', () => {
    render(<EmptyStatePlaceholder />);
    expect(screen.getByText('Start a conversation')).toBeInTheDocument();
    expect(
      screen.getByText(/Ask a question, give a command, or describe what you'd like help with/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Your AI agent is ready to assist/i)).toBeInTheDocument();
  });

  /* Preconditions: Component rendered
     Action: check accessibility
     Assertions: component is accessible with proper text hierarchy
     Requirements: agents.4 */
  it('should be accessible with proper text hierarchy', () => {
    const { container } = render(<EmptyStatePlaceholder />);
    const heading = container.querySelector('h3');
    const paragraph = container.querySelector('p');

    expect(heading).toBeInTheDocument();
    expect(paragraph).toBeInTheDocument();
    expect(heading?.textContent).toBe('Start a conversation');
  });
});
