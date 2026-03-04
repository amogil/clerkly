/**
 * @jest-environment jsdom
 */

/* Preconditions: AgentWelcome component
   Action: render component
   Assertions: correct rendering of empty state UI with new design
   Requirements: agents.4.14-4.21 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentWelcome } from '../../../../src/renderer/components/agents/AgentWelcome';

describe('AgentWelcome', () => {
  const mockOnPromptClick = jest.fn();

  /* Preconditions: Component rendered
     Action: render AgentWelcome
     Assertions: component renders without errors
     Requirements: agents.4.14 */
  it('should render without errors', () => {
    const { container } = render(<AgentWelcome onPromptClick={mockOnPromptClick} />);
    expect(container).toBeInTheDocument();
  });

  /* Preconditions: Component rendered
     Action: check for heading
     Assertions: heading "Assign a task to the agent" is displayed
     Requirements: agents.4.15 */
  it('should display heading "Assign a task to the agent"', () => {
    render(<AgentWelcome onPromptClick={mockOnPromptClick} />);
    const heading = screen.getByText('Assign a task to the agent');
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H2');
  });

  /* Preconditions: Component rendered
     Action: check for description text
     Assertions: description text is displayed
     Requirements: agents.4.15 */
  it('should display description text', () => {
    render(<AgentWelcome onPromptClick={mockOnPromptClick} />);
    const description = screen.getByText(
      /Transcribes meetings, extracts tasks, creates Jira tickets/i
    );
    expect(description).toBeInTheDocument();
  });

  /* Preconditions: Component rendered
     Action: check for animated logo
     Assertions: Logo component is rendered
     Requirements: agents.4.16 */
  it('should display animated logo', () => {
    const { container } = render(<AgentWelcome onPromptClick={mockOnPromptClick} />);
    const logo = container.querySelector('svg');
    expect(logo).toBeInTheDocument();
  });

  /* Preconditions: Component rendered
     Action: check layout structure
     Assertions: correct flex layout classes are applied
     Requirements: agents.4.14 */
  it('should have correct layout structure', () => {
    const { container } = render(<AgentWelcome onPromptClick={mockOnPromptClick} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).toHaveClass('flex-col');
    expect(wrapper).toHaveClass('items-center');
    expect(wrapper).toHaveClass('justify-center');
  });

  /* Preconditions: Component rendered
     Action: check heading styling
     Assertions: heading has correct text size and weight
     Requirements: agents.4.15 */
  it('should have styled heading', () => {
    render(<AgentWelcome onPromptClick={mockOnPromptClick} />);
    const heading = screen.getByText('Assign a task to the agent');
    expect(heading).toHaveClass('text-xl');
    expect(heading).toHaveClass('font-semibold');
    expect(heading).toHaveClass('text-foreground');
  });

  /* Preconditions: Component rendered
     Action: check description styling
     Assertions: description has correct text size and color
     Requirements: agents.4.15 */
  it('should have styled description', () => {
    render(<AgentWelcome onPromptClick={mockOnPromptClick} />);
    const description = screen.getByText(
      /Transcribes meetings, extracts tasks, creates Jira tickets/i
    );
    expect(description).toHaveClass('text-sm');
    expect(description).toHaveClass('text-muted-foreground');
  });

  /* Preconditions: Component rendered
     Action: check for prompt buttons
     Assertions: all 4 prompt buttons are present
     Requirements: agents.4.17 */
  it('should display 4 prompt suggestion buttons', () => {
    render(<AgentWelcome onPromptClick={mockOnPromptClick} />);
    expect(screen.getByText(/Transcribe my latest meeting/i)).toBeInTheDocument();
    expect(screen.getByText(/Extract action items from today's standup/i)).toBeInTheDocument();
    expect(screen.getByText(/Create Jira tickets from meeting notes/i)).toBeInTheDocument();
    expect(screen.getByText(/Send summary to the team/i)).toBeInTheDocument();
  });

  /* Preconditions: Component rendered
     Action: check accessibility
     Assertions: component is accessible with proper text hierarchy
     Requirements: agents.4.14 */
  it('should be accessible with proper text hierarchy', () => {
    const { container } = render(<AgentWelcome onPromptClick={mockOnPromptClick} />);
    const heading = container.querySelector('h2');
    const paragraph = container.querySelector('p');

    expect(heading).toBeInTheDocument();
    expect(paragraph).toBeInTheDocument();
    expect(heading?.textContent).toBe('Assign a task to the agent');
  });
});
