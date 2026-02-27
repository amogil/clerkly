import React from 'react';
// Requirements: llm-integration.3.4.1, llm-integration.3.4.4, llm-integration.3.7, agents.4.10.2
import { cn } from '../../lib/utils';

type AgentDialogIntent = 'error' | 'warning' | 'info' | 'confirmation';

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
  warning: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  confirmation: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
};

// Requirements: llm-integration.3.4.1, llm-integration.3.4.4, llm-integration.3.7, agents.4.10.2
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
    <div
      data-testid={testId}
      data-approval-id={approvalId}
      role="alert"
      className={cn(
        'flex w-full max-w-full flex-col gap-2 rounded-2xl border px-4 py-3',
        intentClasses[intent],
        className
      )}
    >
      <div
        className={cn(
          'flex-1 text-sm leading-relaxed whitespace-pre-wrap break-words',
          messageClassName
        )}
      >
        {message}
      </div>
      {actions && <div className={cn('flex items-center gap-2', actionsClassName)}>{actions}</div>}
    </div>
  );
}
