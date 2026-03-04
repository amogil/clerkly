'use client';

import * as React from 'react';

import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

type ConfirmationState =
  | 'approval-requested'
  | 'approval-responded'
  | 'output-denied'
  | 'output-available';
type ConfirmationApproval = { id: string; approved?: boolean };

interface ConfirmationContextValue {
  state: ConfirmationState;
  approval?: ConfirmationApproval;
}

const ConfirmationContext = React.createContext<ConfirmationContextValue | null>(null);

// Requirements: llm-integration.3.4.1, llm-integration.3.7
function useConfirmationContext(): ConfirmationContextValue {
  const context = React.useContext(ConfirmationContext);
  if (!context) {
    throw new Error('Confirmation components must be used within Confirmation');
  }
  return context;
}

export type ConfirmationProps = React.ComponentProps<'div'> & {
  state: ConfirmationState;
  approval?: ConfirmationApproval;
};

// Requirements: llm-integration.3.4.1, llm-integration.3.7
export function Confirmation({ state, approval, className, ...props }: ConfirmationProps) {
  return (
    <ConfirmationContext.Provider value={{ state, approval }}>
      <Alert
        data-state={state}
        data-approved={approval?.approved === undefined ? undefined : String(approval.approved)}
        className={cn('grid gap-2', className)}
        {...props}
      />
    </ConfirmationContext.Provider>
  );
}

export type ConfirmationRequestProps = React.ComponentProps<'div'>;

// Requirements: llm-integration.3.4.1, llm-integration.3.7
export function ConfirmationRequest({ className, ...props }: ConfirmationRequestProps) {
  const { state } = useConfirmationContext();
  if (state !== 'approval-requested') {
    return null;
  }
  return <div className={cn('col-start-2 text-sm leading-relaxed', className)} {...props} />;
}

export type ConfirmationAcceptedProps = React.ComponentProps<'div'>;

// Requirements: llm-integration.3.4.1, llm-integration.3.7
export function ConfirmationAccepted({ className, ...props }: ConfirmationAcceptedProps) {
  const { state, approval } = useConfirmationContext();
  const isAccepted = state === 'approval-responded' || state === 'output-available';
  if (!isAccepted || approval?.approved === false) {
    return null;
  }
  return (
    <div className={cn('col-start-2 flex items-center gap-2 text-sm', className)} {...props} />
  );
}

export type ConfirmationRejectedProps = React.ComponentProps<'div'>;

// Requirements: llm-integration.3.4.1, llm-integration.3.7
export function ConfirmationRejected({ className, ...props }: ConfirmationRejectedProps) {
  const { state, approval } = useConfirmationContext();
  const isRejected = state === 'output-denied' || approval?.approved === false;
  if (!isRejected) {
    return null;
  }
  return (
    <div className={cn('col-start-2 flex items-center gap-2 text-sm', className)} {...props} />
  );
}

export type ConfirmationActionsProps = React.ComponentProps<'div'>;

// Requirements: llm-integration.3.4.1, llm-integration.3.7
export function ConfirmationActions({ className, ...props }: ConfirmationActionsProps) {
  const { state } = useConfirmationContext();
  if (state !== 'approval-requested') {
    return null;
  }
  return <div className={cn('col-start-2 flex items-center gap-2', className)} {...props} />;
}

export type ConfirmationActionProps = React.ComponentProps<typeof Button>;

// Requirements: llm-integration.3.4.1, llm-integration.3.7
export function ConfirmationAction({ className, ...props }: ConfirmationActionProps) {
  return <Button className={className} {...props} />;
}
