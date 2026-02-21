import React from 'react';
import { Logo } from '../logo';
import { isInProgress, type AgentStatus } from '../../../shared/utils/agentStatus';
import type { MessageSnapshot } from '../../../shared/events/types';

// Requirements: llm-integration.7, agents.4.22

interface MessageBubbleProps {
  message: MessageSnapshot;
  showAvatar: boolean;
  agentStatus: AgentStatus;
}

export function MessageBubble({ message, showAvatar, agentStatus }: MessageBubbleProps) {
  if (message.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="rounded-2xl bg-secondary/70 border border-border px-4 py-3 max-w-[75%]">
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {String(message.payload.data?.text || '')}
          </p>
        </div>
      </div>
    );
  }

  if (message.kind === 'error') {
    // Requirements: llm-integration.7 — error bubble
    const errorData = message.payload.data as Record<string, unknown> | undefined;
    const errorInfo = errorData?.['error'] as { message?: string } | undefined;

    return (
      <>
        {showAvatar && (
          <div className="mb-2">
            <Logo size="sm" showText={false} animated={false} />
          </div>
        )}
        <div
          data-testid="message-error"
          className="max-w-[85%] text-sm leading-relaxed text-red-500 whitespace-pre-wrap break-words rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3"
        >
          {errorInfo?.message || 'Unknown error'}
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
        <div data-testid="message-llm" className="max-w-[85%] space-y-2">
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
      <div className="max-w-[85%] text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
        {String(message.payload.data?.text || '')}
      </div>
    </>
  );
}
