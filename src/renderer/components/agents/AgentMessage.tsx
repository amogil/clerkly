import React from 'react';
// Requirements: llm-integration.7, llm-integration.3.4.1, llm-integration.3.4.4, agents.4.22, agents.4.9, agents.4.10.1, agents.4.10.2, agents.7.4
import { Check } from 'lucide-react';
import { Message, MessageContent, MessageResponse } from '../ai-elements/message';
import { Reasoning, ReasoningContent } from '../ai-elements/reasoning';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '../ai-elements/tool';
import { Queue, QueueItem, QueueItemContent } from '../ai-elements/queue';
import { toUIMessage } from '../../lib/messageMapper';
import { normalizeMathDelimiters } from '../../lib/mathDelimiterNormalization';
import type { MessageSnapshot } from '../../../shared/events/types';
import { AgentErrorDialog } from './AgentErrorDialog';
import type { AgentDialogActionItem } from './AgentDialog';
import { AgentReasoningTrigger } from './AgentReasoningTrigger';

interface AgentMessageProps {
  message: MessageSnapshot;
  isReasoningStreaming?: boolean;
  onNavigate?: (screen: string) => void;
}

// Requirements: llm-integration.7, llm-integration.3.4.1, llm-integration.3.4.4, agents.4.22, agents.4.9, agents.4.10.1, agents.4.10.2
export function AgentMessage({
  message,
  isReasoningStreaming = false,
  onNavigate,
}: AgentMessageProps) {
  const [isDismissed, setIsDismissed] = React.useState(false);

  const isLlmMessage = message.kind === 'llm';
  const llmData = isLlmMessage
    ? (message.payload.data as Record<string, unknown> | undefined)
    : undefined;
  const llmReasoning = llmData?.['reasoning'] as { text?: string } | undefined;
  const llmTextRaw = typeof llmData?.['text'] === 'string' ? (llmData['text'] as string) : undefined;
  const llmText = llmTextRaw ? normalizeMathDelimiters(llmTextRaw) : undefined;
  const llmReasoningText = llmReasoning?.text
    ? normalizeMathDelimiters(llmReasoning.text)
    : undefined;

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
    if (isDismissed) {
      return null;
    }
    // Requirements: llm-integration.7, llm-integration.3.4.1, llm-integration.3.4.3 — error bubble with optional actions
    const errorData = message.payload.data as Record<string, unknown> | undefined;
    const errorInfo = errorData?.['error'] as
      | { type?: string; message?: string; action_link?: { label: string; screen: string } }
      | undefined;

    const errorMessage = errorInfo?.message || 'Unknown error';
    const actionLink = errorInfo?.action_link;
    const canRetry = errorInfo?.type === 'auth';

    const actionItems: AgentDialogActionItem[] = [];
    // Requirements: agents.4.10.3, agents.4.10.4, agents.4.10.4.1
    // Fixed order: Open Settings first, Retry second.
    if (actionLink && onNavigate) {
      actionItems.push({
        id: 'error-open-settings',
        label: actionLink.label,
        onClick: () => onNavigate(actionLink.screen),
        testId: 'message-error-action-link',
        variant: 'outline',
      });
    }
    if (canRetry) {
      actionItems.push({
        id: 'error-retry',
        label: 'Retry',
        onClick: () => {
          // Requirements: agents.4.10.5
          // Hide dialog immediately before launching retry.
          setIsDismissed(true);
          window.api.messages.retryLast(message.agentId).catch(() => {});
        },
        testId: 'message-error-retry',
        variant: 'default',
      });
    }

    return (
      <Message from="assistant" className="w-full max-w-full">
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
        <div data-testid="message-llm" className="space-y-2 message-llm message-llm-response">
          {(llmReasoning?.text || isReasoningStreaming) && (
            // Requirements: llm-integration.2, llm-integration.7.2 — collapsible reasoning block with streaming state
            <Reasoning isStreaming={isReasoningStreaming}>
              <AgentReasoningTrigger />
              <ReasoningContent data-testid="message-llm-reasoning">
                {llmReasoningText ?? ''}
              </ReasoningContent>
            </Reasoning>
          )}
          {llmText ? (
            <MessageContent
              data-testid="message-llm-action"
              className="w-full message-llm-action message-llm-action-response"
            >
              <MessageResponse className="text-sm leading-relaxed break-words">
                {llmText}
              </MessageResponse>
            </MessageContent>
          ) : null}
        </div>
      </Message>
    );
  }

  if (message.kind === 'tool_call') {
    const toolData = message.payload.data as
      | {
          toolName?: unknown;
          arguments?: Record<string, unknown>;
        }
      | undefined;

    if (toolData?.toolName === 'final_answer') {
      const args =
        toolData.arguments && typeof toolData.arguments === 'object'
          ? toolData.arguments
          : undefined;
      const summaryPointsRaw = args?.['summary_points'];
      const summaryPoints = Array.isArray(summaryPointsRaw)
        ? summaryPointsRaw.filter((point): point is string => typeof point === 'string')
        : [];

      return (
        <Message from="assistant" className="w-full max-w-full">
          <Queue data-testid="message-final-answer-block">
            <div data-testid="message-final-answer-summary">
              {summaryPoints.map((point, index) => (
                <QueueItem
                  key={`${index}-${point}`}
                  data-testid="message-final-answer-item"
                  className="flex-row items-start gap-2"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-600">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                  <QueueItemContent completed={false}>{point}</QueueItemContent>
                </QueueItem>
              ))}
            </div>
          </Queue>
        </Message>
      );
    }

    const uiMessage = toUIMessage(message);
    const toolPart = uiMessage?.parts.find((part) => part.type === 'dynamic-tool') as
      | {
          type: 'dynamic-tool';
          toolName: string;
          toolCallId: string;
          state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
          input?: unknown;
          output?: unknown;
          errorText?: string;
        }
      | undefined;

    if (!toolPart) {
      return null;
    }

    const toolName = toolPart.toolName;
    const callId = toolPart.toolCallId;
    const toolInput = JSON.stringify(toolPart.input ?? {}, null, 2);
    const toolStatus =
      toolPart.state === 'output-error'
        ? 'error'
        : toolPart.state === 'output-available'
          ? 'success'
          : 'in-progress';

    const toolOutput =
      toolPart.state === 'output-error'
        ? (toolPart.errorText ?? 'Tool execution failed')
        : toolPart.state === 'output-available'
          ? JSON.stringify(toolPart.output ?? {}, null, 2)
          : '';

    return (
      <Message from="assistant" className="w-full max-w-full">
        <Tool data-testid="message-tool-call">
          <ToolHeader data-testid="message-tool-call-header">
            <div className="font-medium text-foreground">{toolName}</div>
            <div className="text-xs text-muted-foreground">
              {toolStatus} · {callId}
            </div>
          </ToolHeader>
          <ToolContent>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Input</div>
              <ToolInput data-testid="message-tool-call-input">{toolInput}</ToolInput>
            </div>
            {toolPart.state === 'output-available' || toolPart.state === 'output-error' ? (
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Output</div>
                <ToolOutput data-testid="message-tool-call-output">{toolOutput}</ToolOutput>
              </div>
            ) : null}
          </ToolContent>
        </Tool>
      </Message>
    );
  }

  return null;
}
