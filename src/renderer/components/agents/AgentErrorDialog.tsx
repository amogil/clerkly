import React from 'react';
// Requirements: llm-integration.3.4.1, llm-integration.3.4.4, agents.4.10.2
import { AgentDialog } from './AgentDialog';

interface AgentErrorDialogProps {
  approvalId: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
  testId?: string;
}

// Requirements: llm-integration.3.4.1, llm-integration.3.4.4, agents.4.10.2
export function AgentErrorDialog({ approvalId, message, action, testId }: AgentErrorDialogProps) {
  return (
    <AgentDialog
      intent="error"
      testId={testId}
      approvalId={approvalId}
      message={message}
      messageClassName="text-red-700"
      actionItems={
        action
          ? [
              {
                id: 'error-action',
                testId: action.testId,
                label: action.label,
                onClick: action.onClick,
                variant: 'outline',
              },
            ]
          : undefined
      }
    />
  );
}
