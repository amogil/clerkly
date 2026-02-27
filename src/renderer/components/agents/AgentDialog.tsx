import React from 'react';
// Requirements: llm-integration.3.4.1, llm-integration.3.4.4, llm-integration.3.7, agents.4.10.2
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

type AgentDialogIntent = 'error' | 'warning' | 'info' | 'confirmation';

export type AgentDialogActionItem = {
  id?: string;
  testId?: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline';
};

interface AgentDialogProps {
  intent: AgentDialogIntent;
  message: React.ReactNode;
  approvalId: string;
  testId?: string;
  actions?: React.ReactNode;
  actionItems?: AgentDialogActionItem[];
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

const actionClasses: Record<AgentDialogIntent, string> = {
  error:
    "[&_[data-slot='button']]:h-7 [&_[data-slot='button']]:!rounded-lg [&_[data-slot='button']]:px-3 [&_[data-slot='button']]:text-xs [&_[data-slot='button']]:font-medium [&_[data-slot='button'][data-variant='outline']]:border-red-200 [&_[data-slot='button'][data-variant='outline']]:text-red-700 [&_[data-slot='button'][data-variant='outline']]:hover:bg-red-50 [&_[data-slot='button'][data-variant='default']]:bg-red-600 [&_[data-slot='button'][data-variant='default']]:text-white [&_[data-slot='button'][data-variant='default']]:hover:bg-red-600/90",
  warning:
    "[&_[data-slot='button']]:h-7 [&_[data-slot='button']]:!rounded-lg [&_[data-slot='button']]:px-3 [&_[data-slot='button']]:text-xs [&_[data-slot='button']]:font-medium [&_[data-slot='button'][data-variant='outline']]:border-yellow-200 [&_[data-slot='button'][data-variant='outline']]:text-yellow-800 [&_[data-slot='button'][data-variant='outline']]:hover:bg-yellow-100/60 [&_[data-slot='button'][data-variant='default']]:bg-yellow-600 [&_[data-slot='button'][data-variant='default']]:text-white [&_[data-slot='button'][data-variant='default']]:hover:bg-yellow-600/90",
  info: "[&_[data-slot='button']]:h-7 [&_[data-slot='button']]:!rounded-lg [&_[data-slot='button']]:px-3 [&_[data-slot='button']]:text-xs [&_[data-slot='button']]:font-medium [&_[data-slot='button'][data-variant='outline']]:border-sky-200 [&_[data-slot='button'][data-variant='outline']]:text-sky-800 [&_[data-slot='button'][data-variant='outline']]:hover:bg-sky-100/60 [&_[data-slot='button'][data-variant='default']]:bg-sky-600 [&_[data-slot='button'][data-variant='default']]:text-white [&_[data-slot='button'][data-variant='default']]:hover:bg-sky-600/90",
  confirmation:
    "[&_[data-slot='button']]:h-7 [&_[data-slot='button']]:!rounded-lg [&_[data-slot='button']]:px-3 [&_[data-slot='button']]:text-xs [&_[data-slot='button']]:font-medium [&_[data-slot='button'][data-variant='outline']]:border-emerald-200 [&_[data-slot='button'][data-variant='outline']]:text-emerald-800 [&_[data-slot='button'][data-variant='outline']]:hover:bg-emerald-50 [&_[data-slot='button'][data-variant='default']]:bg-emerald-600 [&_[data-slot='button'][data-variant='default']]:text-white [&_[data-slot='button'][data-variant='default']]:hover:bg-emerald-600/90",
};

// Requirements: llm-integration.3.4.1, llm-integration.3.4.4, llm-integration.3.7, agents.4.10.2
export function AgentDialog({
  intent,
  message,
  approvalId,
  testId,
  actions,
  actionItems,
  className,
  messageClassName,
  actionsClassName,
}: AgentDialogProps) {
  const hasActions = Boolean(actions) || Boolean(actionItems?.length);

  return (
    <div
      data-testid={testId}
      data-approval-id={approvalId}
      role="alert"
      className={cn(
        'flex w-full max-w-full rounded-2xl border px-4 py-3',
        hasActions ? 'flex-row items-center gap-3' : 'flex-col gap-2',
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
      {hasActions && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-end gap-2',
            hasActions && 'ml-auto',
            actionClasses[intent],
            actionsClassName
          )}
        >
          {actionItems?.length
            ? actionItems.map((item) => (
                <Button
                  key={item.id || item.label}
                  type="button"
                  variant={item.variant ?? 'outline'}
                  size="xs"
                  data-testid={item.testId}
                  onClick={item.onClick}
                >
                  {item.label}
                </Button>
              ))
            : actions}
        </div>
      )}
    </div>
  );
}
