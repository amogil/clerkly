import React from 'react';
// Requirements: llm-integration.3.4.1, llm-integration.3.4.3, llm-integration.3.4.4, agents.4.10.2
import { AgentDialog, type AgentDialogActionItem } from './AgentDialog';

interface AgentErrorDialogProps {
  approvalId: string;
  message: string;
  actions?: AgentDialogActionItem[];
  testId?: string;
}

// Requirements: llm-integration.3.4.1, llm-integration.3.4.3, llm-integration.3.4.4, agents.4.10.2
export function AgentErrorDialog({ approvalId, message, actions, testId }: AgentErrorDialogProps) {
  return (
    <AgentDialog
      intent="error"
      testId={testId}
      approvalId={approvalId}
      message={message}
      messageClassName="text-red-700"
      actionItems={actions}
    />
  );
}
