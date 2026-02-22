import React from 'react';
import { Logo } from '../logo';
import { isInProgress, type AgentStatus } from '../../../shared/utils/agentStatus';
import type { MessageSnapshot } from '../../../shared/events/types';

// Requirements: llm-integration.7, llm-integration.3.4.1, agents.4.22

interface MessageBubbleProps {
  message: MessageSnapshot;
  showAvatar: boolean;
  agentStatus: AgentStatus;
  onNavigate?: (screen: string) => void;
}

export function MessageBubble({
  message,
  showAvatar,
  agentStatus,
  onNavigate,
}: MessageBubbleProps) {
  if (message.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div
          data-testid="message-user"
          className="rounded-2xl bg-secondary/70 border border-border px-4 py-3 min-w-0"
        >
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {String(message.payload.data?.text || '')}
          </p>
        </div>
      </div>
    );
  }

  if (message.kind === 'error') {
    // Requirements: llm-integration.7, llm-integration.3.4.1 — error bubble with optional action_link
    const errorData = message.payload.data as Record<string, unknown> | undefined;
    const errorInfo = errorData?.['error'] as
      | { message?: string; action_link?: { label: string; screen: string } }
      | undefined;

    return (
      <>
        {showAvatar && (
          <div className="mb-2">
            <Logo size="sm" showText={false} animated={false} />
          </div>
        )}
        <div
          data-testid="message-error"
          className="text-sm leading-relaxed text-red-500 whitespace-pre-wrap break-words rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3"
        >
          {errorInfo?.message || 'Unknown error'}
          {errorInfo?.action_link && onNavigate && (
            <button
              data-testid="message-error-action-link"
              onClick={() => onNavigate(errorInfo.action_link!.screen)}
              className="ml-2 underline text-red-600 hover:text-red-800 font-medium"
            >
              {errorInfo.action_link.label}
            </button>
          )}
        </div>
      </>
    );
  }

  if (message.kind === 'llm') {
    // Requirements: llm-integration.7 — llm bubble: reasoning then action, or loading indicator
    const llmData = message.payload.data as Record<string, unknown> | undefined;
    const llmReasoning = llmData?.['reasoning'] as { text?: string } | undefined;
    const llmAction = llmData?.['action'] as { type?: string; content?: string } | undefined;

    return (
      <>
        {showAvatar && (
          <div className="mb-2">
            <Logo size="sm" showText={false} animated={isInProgress(agentStatus)} />
          </div>
        )}
        <div data-testid="message-llm" className="space-y-2">
          {llmReasoning?.text && (
            <div
              data-testid="message-llm-reasoning"
              className="text-xs text-muted-foreground italic whitespace-pre-wrap break-words"
            >
              {llmReasoning.text}
            </div>
          )}
          {llmAction?.content ? (
            <div
              data-testid="message-llm-action"
              className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words"
            >
              {llmAction.content}
            </div>
          ) : (
            // Loading indicator — three dots
            <div data-testid="message-llm-loading" className="flex gap-1 items-center py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
            </div>
          )}
        </div>
      </>
    );
  }

  // Fallback for other kinds
  return (
    <>
      {showAvatar && (
        <div className="mb-2">
          <Logo size="sm" showText={false} animated={isInProgress(agentStatus)} />
        </div>
      )}
      <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
        {String(message.payload.data?.text || '')}
      </div>
    </>
  );
}
