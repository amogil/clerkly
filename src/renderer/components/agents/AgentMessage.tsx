import React, { useEffect, useMemo, useRef } from 'react';
// Requirements: llm-integration.7, llm-integration.9.2, llm-integration.9.3, llm-integration.9.5, llm-integration.3.4.1, llm-integration.3.4.4, agents.4.22, agents.4.9, agents.4.10.1, agents.4.10.2
import { Logo } from '../logo';
import { isInProgress, type AgentStatus } from '../../../shared/utils/agentStatus';
import { Message, MessageContent, MessageResponse } from '../ai-elements/message';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '../ai-elements/reasoning';
import type { MessageSnapshot } from '../../../shared/events/types';
import { AgentErrorDialog } from './AgentErrorDialog';
import type { AgentDialogActionItem } from './AgentDialog';
import { resolveMessageImages } from '../../lib/MessageImageResolver';

interface AgentMessageProps {
  message: MessageSnapshot;
  showAvatar: boolean;
  agentStatus: AgentStatus;
  onNavigate?: (screen: string) => void;
}

// Requirements: llm-integration.7, llm-integration.9.2, llm-integration.9.3, llm-integration.9.5, llm-integration.3.4.1, llm-integration.3.4.4, agents.4.22, agents.4.9, agents.4.10.1, agents.4.10.2
export function AgentMessage({ message, showAvatar, agentStatus, onNavigate }: AgentMessageProps) {
  const isLlmMessage = message.kind === 'llm';
  const llmData = isLlmMessage
    ? (message.payload.data as Record<string, unknown> | undefined)
    : undefined;
  const llmReasoning = llmData?.['reasoning'] as { text?: string } | undefined;
  const llmAction = llmData?.['action'] as { type?: string; content?: string } | undefined;
  const contentRef = useRef<HTMLDivElement>(null);
  const descriptors = useMemo(() => {
    const llmImages = (llmData?.['images'] as Array<Record<string, unknown>> | undefined) ?? [];
    return llmImages
      .map((img) => {
        const rawId = img['id'];
        const id = typeof rawId === 'number' ? rawId : Number(rawId);
        return {
          id,
          url: typeof img['url'] === 'string' ? img['url'] : undefined,
          alt: typeof img['alt'] === 'string' ? img['alt'] : undefined,
          link: typeof img['link'] === 'string' ? img['link'] : undefined,
        };
      })
      .filter((img) => Number.isInteger(img.id) && img.id > 0);
  }, [llmData]);

  useEffect(() => {
    if (!isLlmMessage || !llmAction?.content || !contentRef.current) return;
    const cleanup = resolveMessageImages(contentRef.current, {
      agentId: message.agentId,
      messageId: message.id,
      content: llmAction.content,
      descriptors,
    });
    return () => cleanup();
  }, [descriptors, isLlmMessage, llmAction?.content, message.agentId, message.id]);

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
    // Requirements: llm-integration.7, llm-integration.3.4.1, llm-integration.3.4.3 — error bubble with optional actions
    const errorData = message.payload.data as Record<string, unknown> | undefined;
    const errorInfo = errorData?.['error'] as
      | { type?: string; message?: string; action_link?: { label: string; screen: string } }
      | undefined;

    const errorMessage = errorInfo?.message || 'Unknown error';
    const actionLink = errorInfo?.action_link;
    const canRetry =
      errorInfo?.type === 'auth' ||
      (errorInfo?.type === 'provider' &&
        errorMessage === 'Invalid response format. Please try again later.');

    const actionItems: AgentDialogActionItem[] = [];
    // Requirements: llm-integration.3.4.5
    // When both actions are present, Open Settings is primary and shown first.
    if (actionLink && onNavigate) {
      actionItems.push({
        id: 'error-open-settings',
        label: actionLink.label,
        onClick: () => onNavigate(actionLink.screen),
        testId: 'message-error-action-link',
        variant: 'default',
      });
    }
    if (canRetry) {
      actionItems.push({
        id: 'error-retry',
        label: 'Retry',
        onClick: () => {
          window.api.messages.retryLast(message.agentId).catch(() => {});
        },
        testId: 'message-error-retry',
        variant: 'outline',
      });
    }

    return (
      <Message from="assistant" className="w-full max-w-full">
        {showAvatar && (
          <div className="mb-2">
            <Logo size="sm" showText={false} animated={false} />
          </div>
        )}
        <AgentErrorDialog
          testId="message-error"
          approvalId={`error-${message.id}`}
          message={errorMessage}
          actions={actionItems.length ? actionItems : undefined}
        />
      </Message>
    );
  }

  if (message.kind === 'llm') {
    // Requirements: llm-integration.7 — llm bubble: reasoning (collapsible) then action, or loading
    return (
      <Message from="assistant" className="w-full max-w-full">
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
            <MessageContent data-testid="message-llm-action" className="w-full">
              <div ref={contentRef}>
                <MessageResponse className="text-sm leading-relaxed break-words">
                  {llmAction.content}
                </MessageResponse>
              </div>
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
    <Message from="assistant" className="w-full max-w-full">
      {showAvatar && (
        <div className="mb-2">
          <Logo size="sm" showText={false} animated={isInProgress(agentStatus)} />
        </div>
      )}
      <MessageContent className="w-full">
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {String(message.payload.data?.text || '')}
        </p>
      </MessageContent>
    </Message>
  );
}
