import React from 'react';
// Requirements: llm-integration.3.4.1, llm-integration.3.7
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationRequest,
} from '../ai-elements/confirmation';
import { cn } from '../../lib/utils';

type AgentDialogIntent = 'error' | 'info' | 'confirmation';

interface AgentDialogProps {
  intent: AgentDialogIntent;
  message: React.ReactNode;
  approvalId: string;
  testId?: string;
  actions?: React.ReactNode;
  className?: string;
  messageClassName?: string;
  actionsClassName?: string;
}

const intentClasses: Record<AgentDialogIntent, string> = {
  error: 'border-red-500/30 bg-red-500/10 text-red-700',
  info: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  confirmation: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
};

// Requirements: llm-integration.3.4.1, llm-integration.3.7
export function AgentDialog({
  intent,
  message,
  approvalId,
  testId,
  actions,
  className,
  messageClassName,
  actionsClassName,
}: AgentDialogProps) {
  return (
    <Confirmation
      data-testid={testId}
      state="approval-requested"
      approval={{ id: approvalId, approved: false }}
      className={cn('w-fit max-w-full rounded-2xl px-4 py-3', intentClasses[intent], className)}
    >
      <ConfirmationRequest
        className={cn('text-sm leading-relaxed whitespace-pre-wrap break-words', messageClassName)}
      >
        {message}
      </ConfirmationRequest>
      {actions && <ConfirmationActions className={actionsClassName}>{actions}</ConfirmationActions>}
    </Confirmation>
  );
}
