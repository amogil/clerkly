// Requirements: llm-integration.3.7
import React, { useState, useEffect, useRef } from 'react';
import { AgentDialog } from './AgentDialog';

// Access window.api with proper typing
declare const window: Window & {
  api: {
    messages: {
      retryLast: (
        agentId: string,
        userMessageId: number
      ) => Promise<{ success: boolean; error?: string }>;
      cancelRetry: (
        agentId: string,
        userMessageId: number
      ) => Promise<{ success: boolean; error?: string }>;
    };
  };
};

interface RateLimitBannerProps {
  agentId: string;
  userMessageId: number;
  retryAfterSeconds: number;
  onDismiss: () => void;
}

/**
 * RateLimitBanner — shown when LLM returns 429.
 * Counts down and auto-retries, or user can cancel.
 * Requirements: llm-integration.3.7.2, llm-integration.3.7.3, llm-integration.3.7.4
 */
export function RateLimitBanner({
  agentId,
  userMessageId,
  retryAfterSeconds,
  onDismiss,
}: RateLimitBannerProps) {
  const [secondsLeft, setSecondsLeft] = useState(retryAfterSeconds);
  const hasRetried = useRef(false);

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (!hasRetried.current) {
        hasRetried.current = true;
        // Auto-retry when countdown reaches zero
        // Requirements: llm-integration.3.7.3
        window.api.messages.retryLast(agentId, userMessageId).catch(() => {});
        onDismiss();
      }
      return;
    }

    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, agentId, userMessageId, onDismiss]);

  const handleCancel = async () => {
    // Requirements: llm-integration.3.7.4
    await window.api.messages.cancelRetry(agentId, userMessageId).catch(() => {});
    onDismiss();
  };

  return (
    <AgentDialog
      intent="warning"
      testId="rate-limit-banner"
      approvalId={`rate-limit-${userMessageId}`}
      messageClassName="text-sm"
      message={`Rate limit exceeded. Retrying in ${secondsLeft} second${
        secondsLeft !== 1 ? 's' : ''
      }...`}
      actionItems={[
        {
          id: 'rate-limit-cancel',
          testId: 'rate-limit-cancel',
          label: 'Cancel',
          onClick: handleCancel,
          variant: 'outline',
        },
      ]}
    />
  );
}
