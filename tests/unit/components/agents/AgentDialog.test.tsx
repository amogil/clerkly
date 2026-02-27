/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { AgentDialog } from '../../../../src/renderer/components/agents/AgentDialog';

describe('AgentDialog', () => {
  /* Preconditions: AgentDialog rendered with error intent and message
     Action: render component
     Assertions: dialog visible with message and test id
     Requirements: llm-integration.3.4.1 */
  it('should render message with test id', () => {
    render(
      <AgentDialog
        intent="error"
        approvalId="error-1"
        testId="agent-dialog"
        message="Something went wrong"
      />
    );

    expect(screen.getByTestId('agent-dialog')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  /* Preconditions: AgentDialog rendered with actions
     Action: render component
     Assertions: action content visible
     Requirements: llm-integration.3.4.1 */
  it('should render actions when provided', () => {
    render(
      <AgentDialog
        intent="info"
        approvalId="info-1"
        testId="agent-dialog-actions"
        message="Info message"
        actions={<span>Action</span>}
      />
    );

    expect(screen.getByText('Action')).toBeInTheDocument();
  });
});
