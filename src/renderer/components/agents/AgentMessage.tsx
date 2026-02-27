import React from 'react';
// Requirements: llm-integration.7, llm-integration.3.4.1, agents.4.22, agents.4.9
import { Logo } from '../logo';
import { isInProgress, type AgentStatus } from '../../../shared/utils/agentStatus';
import { Message, MessageContent, MessageResponse } from '../ai-elements/message';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
} from '../ai-elements/confirmation';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '../ai-elements/reasoning';
import type { MessageSnapshot } from '../../../shared/events/types';

interface AgentMessageProps {
  message: MessageSnapshot;
  showAvatar: boolean;
  agentStatus: AgentStatus;
  onNavigate?: (screen: string) => void;
}

// Requirements: llm-integration.7, llm-integration.3.4.1, agents.4.22, agents.4.9
export function AgentMessage({ message, showAvatar, agentStatus, onNavigate }: AgentMessageProps) {
  if (message.kind === 'user') {
    return (
      // Requirements: agents.4.9 — user bubble: right-aligned, rounded, secondary bg
      <Message from="user">
        <MessageContent
          data-testid="message-user"
          className="rounded-2xl bg-secondary/70 border border-border px-4 py-3"
        >
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {String(message.payload.data?.text || '')}
          </p>
        </MessageContent>
      </Message>
    );
  }

  if (message.kind === 'error') {
    // Requirements: llm-integration.7, llm-integration.3.4.1 — error bubble with optional action_link
    const errorData = message.payload.data as Record<string, unknown> | undefined;
    const errorInfo = errorData?.['error'] as
      | { message?: string; action_link?: { label: string; screen: string } }
      | undefined;

    const errorMessage = errorInfo?.message || 'Unknown error';
    const actionLink = errorInfo?.action_link;

    return (
      <Message from="assistant">
        {showAvatar && (
          <div className="mb-2">
            <Logo size="sm" showText={false} animated={false} />
          </div>
        )}
        <Confirmation
          data-testid="message-error"
          state="approval-requested"
          approval={{ id: `error-${message.id}`, approved: false }}
          className="w-fit max-w-full rounded-2xl border border-red-500/30 bg-red-500/10 text-red-700 px-4 py-3"
        >
          <ConfirmationRequest className="text-sm leading-relaxed whitespace-pre-wrap break-words text-red-700">
            {errorMessage}
          </ConfirmationRequest>
          {actionLink && onNavigate && (
            <ConfirmationActions className="pt-1">
              <ConfirmationAction
                data-testid="message-error-action-link"
                variant="link"
                size="xs"
                onClick={() => onNavigate(actionLink.screen)}
                className="h-auto p-0 text-red-700 hover:text-red-800"
              >
                {actionLink.label}
              </ConfirmationAction>
            </ConfirmationActions>
          )}
        </Confirmation>
      </Message>
    );
  }

  if (message.kind === 'llm') {
    // Requirements: llm-integration.7 — llm bubble: reasoning (collapsible) then action, or loading
    const llmData = message.payload.data as Record<string, unknown> | undefined;
    const llmReasoning = llmData?.['reasoning'] as { text?: string } | undefined;
    const llmAction = llmData?.['action'] as { type?: string; content?: string } | undefined;

    return (
      <Message from="assistant">
        {showAvatar && (
          <div className="mb-2">
            <Logo size="sm" showText={false} animated={isInProgress(agentStatus)} />
          </div>
        )}
        <div data-testid="message-llm" className="space-y-2">
          {llmReasoning?.text && (
            // Requirements: llm-integration.2 — collapsible reasoning block
            <Reasoning>
              <ReasoningTrigger />
              <ReasoningContent data-testid="message-llm-reasoning">
                {llmReasoning.text}
              </ReasoningContent>
            </Reasoning>
          )}
          {llmAction?.content ? (
            <MessageContent data-testid="message-llm-action">
              <MessageResponse className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                {llmAction.content}
              </MessageResponse>
            </MessageContent>
          ) : (
            // Loading indicator — three bouncing dots
            <div data-testid="message-llm-loading" className="flex gap-1 items-center py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
            </div>
          )}
        </div>
      </Message>
    );
  }

  // Fallback for other kinds
  return (
    <Message from="assistant">
      {showAvatar && (
        <div className="mb-2">
          <Logo size="sm" showText={false} animated={isInProgress(agentStatus)} />
        </div>
      )}
      <MessageContent>
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {String(message.payload.data?.text || '')}
        </p>
      </MessageContent>
    </Message>
  );
}
