/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
} from '../../../../src/renderer/components/ai-elements/confirmation';

describe('Confirmation', () => {
  /* Preconditions: Confirmation in approval-requested state
     Action: render Confirmation with request and actions
     Assertions: request and actions are visible
     Requirements: llm-integration.3.4.1, llm-integration.3.7 */
  it('should render request and actions for approval-requested', () => {
    render(
      <Confirmation state="approval-requested" approval={{ id: 'confirm-1' }}>
        <ConfirmationRequest>Request text</ConfirmationRequest>
        <ConfirmationActions>Actions here</ConfirmationActions>
      </Confirmation>
    );

    expect(screen.getByText('Request text')).toBeInTheDocument();
    expect(screen.getByText('Actions here')).toBeInTheDocument();
  });

  /* Preconditions: Confirmation in approval-responded state
     Action: render Confirmation with request and actions
     Assertions: request and actions are not rendered
     Requirements: llm-integration.3.4.1 */
  it('should hide request and actions after approval requested phase', () => {
    render(
      <Confirmation state="approval-responded" approval={{ id: 'confirm-2', approved: true }}>
        <ConfirmationRequest>Request text</ConfirmationRequest>
        <ConfirmationActions>Actions here</ConfirmationActions>
      </Confirmation>
    );

    expect(screen.queryByText('Request text')).not.toBeInTheDocument();
    expect(screen.queryByText('Actions here')).not.toBeInTheDocument();
  });

  /* Preconditions: Confirmation approval-responded with approved=true
     Action: render ConfirmationAccepted
     Assertions: accepted content visible
     Requirements: llm-integration.3.4.1 */
  it('should render accepted content for approved state', () => {
    render(
      <Confirmation state="approval-responded" approval={{ id: 'confirm-3', approved: true }}>
        <ConfirmationAccepted>Accepted</ConfirmationAccepted>
      </Confirmation>
    );

    expect(screen.getByText('Accepted')).toBeInTheDocument();
  });

  /* Preconditions: Confirmation output-denied or approved=false
     Action: render ConfirmationRejected
     Assertions: rejected content visible
     Requirements: llm-integration.3.4.1 */
  it('should render rejected content for rejected state', () => {
    render(
      <Confirmation state="output-denied" approval={{ id: 'confirm-4', approved: false }}>
        <ConfirmationRejected>Rejected</ConfirmationRejected>
      </Confirmation>
    );

    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });
});
