import React from 'react';
// Requirements: llm-integration.7, llm-integration.3.4.1, llm-integration.3.4.4, agents.4.22, agents.4.9, agents.4.10.1, agents.4.10.2, agents.7.4
import {
  Check,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockAlert,
  CircleSlash,
  LoaderCircle,
  XCircleIcon,
} from 'lucide-react';
import { Message, MessageContent, MessageResponse } from '../ai-elements/message';
import { Reasoning, ReasoningContent } from '../ai-elements/reasoning';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '../ai-elements/tool';
import { Queue, QueueItem } from '../ai-elements/queue';
import { CollapsibleTrigger } from '../ui/collapsible';
import { toUIMessage } from '../../lib/messageMapper';
import {
  normalizeMathDelimiters,
  normalizeReasoningMarkdownSpacing,
} from '../../lib/mathDelimiterNormalization';
import type { MessageSnapshot } from '../../../shared/events/types';
import { AgentErrorDialog } from './AgentErrorDialog';
import type { AgentDialogActionItem } from './AgentDialog';
import { AgentReasoningTrigger } from './AgentReasoningTrigger';

const TITLE_META_COMMENT_RENDER_PATTERN = /<!--\s*clerkly:title-meta:[\s\S]*?(?:-->|$)/g;

interface AgentMessageProps {
  message: MessageSnapshot;
  isReasoningStreaming?: boolean;
  onNavigate?: (screen: string) => void;
}

// Requirements: agents.7.4.2.2.1, agents.14.5
function stripAutoTitleMetadataComments(text: string): string {
  return text.replace(TITLE_META_COMMENT_RENDER_PATTERN, '');
}

// Requirements: agents.7.4.2.2.1, agents.7.4.6.3, agents.14.5
function sanitizeInlineToolText(text: string): string {
  return stripAutoTitleMetadataComments(text)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Requirements: agents.7.4.6.5.2
function buildCodeFence(code: string, language: string): string {
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

// Requirements: agents.7.4.6.4
function getCodeExecStatusIcon(status: string): React.ReactNode {
  switch (status) {
    case 'success':
      return <CheckCircleIcon className="size-4 text-green-600" />;
    case 'cancelled':
      return <CircleSlash className="size-4 text-muted-foreground" />;
    case 'running':
      return <LoaderCircle className="size-4 animate-spin text-muted-foreground" />;
    case 'timeout':
      return <ClockAlert className="size-4 text-amber-600" />;
    default:
      return <XCircleIcon className="size-4 text-red-600" />;
  }
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
  const llmTextRaw =
    typeof llmData?.['text'] === 'string' ? (llmData['text'] as string) : undefined;
  const llmText = llmTextRaw
    ? normalizeMathDelimiters(stripAutoTitleMetadataComments(llmTextRaw))
    : undefined;
  const llmReasoningText = llmReasoning?.text
    ? normalizeMathDelimiters(
        normalizeReasoningMarkdownSpacing(stripAutoTitleMetadataComments(llmReasoning.text))
      )
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
              <MessageResponse className="message-response-transparent-code-blocks text-sm leading-relaxed break-words">
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
          output?: Record<string, unknown>;
        }
      | undefined;

    if (toolData?.toolName === 'final_answer') {
      const args =
        toolData.arguments && typeof toolData.arguments === 'object'
          ? toolData.arguments
          : undefined;
      const summaryPointsRaw = args?.['summary_points'];
      const summaryPoints = Array.isArray(summaryPointsRaw)
        ? summaryPointsRaw
            .filter((point): point is string => typeof point === 'string')
            .map((point) => stripAutoTitleMetadataComments(point))
            .filter((point) => point.trim().length > 0)
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
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-600">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                  <MessageContent className="w-full message-llm-action message-llm-action-response">
                    <MessageResponse className="message-response-transparent-code-blocks text-sm leading-relaxed break-words">
                      {point}
                    </MessageResponse>
                  </MessageContent>
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

    if (toolData?.toolName === 'code_exec') {
      const output = (toolData.output ?? {}) as {
        status?: unknown;
        stdout?: unknown;
        stderr?: unknown;
        error?: unknown;
      };
      const status =
        typeof output.status === 'string' ? output.status : message.done ? 'success' : 'running';
      const stdout = typeof output.stdout === 'string' ? output.stdout : '';
      const stderr = typeof output.stderr === 'string' ? output.stderr : '';
      const errorData =
        output.error && typeof output.error === 'object'
          ? (output.error as { code?: unknown; message?: unknown })
          : null;
      const errorCode = typeof errorData?.code === 'string' ? errorData.code : null;
      const errorMessage = typeof errorData?.message === 'string' ? errorData.message : null;
      const errorText =
        errorCode && errorMessage
          ? `${errorCode}: ${errorMessage}`
          : (errorMessage ?? errorCode ?? null);
      const codeInput =
        toolData.arguments && typeof toolData.arguments.code === 'string'
          ? stripAutoTitleMetadataComments(toolData.arguments.code)
          : stripAutoTitleMetadataComments(JSON.stringify(toolData.arguments ?? {}, null, 2));
      const taskSummary =
        toolData.arguments && typeof toolData.arguments.task_summary === 'string'
          ? sanitizeInlineToolText(toolData.arguments.task_summary) || 'Code'
          : 'Code';
      return (
        <Message from="assistant" className="w-full max-w-full">
          <Tool
            data-testid="message-code-exec-block"
            className="bg-transparent min-w-0 max-w-full overflow-hidden"
          >
            <CollapsibleTrigger
              data-testid="message-code-exec-toggle"
              className="flex w-full items-center justify-between gap-4 p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  data-testid="message-code-exec-status-icon"
                  data-status={status}
                  className="flex items-center"
                >
                  {getCodeExecStatusIcon(status)}
                </span>
                <span className="font-medium text-sm">{taskSummary}</span>
              </div>
              <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <ToolContent
              data-testid="message-code-exec-content"
              className="min-w-0 max-w-full grid-cols-1 overflow-hidden"
            >
              <div className="min-w-0 max-w-full overflow-hidden">
                <div
                  data-testid="message-code-exec-input"
                  className="message-code-exec-text-section"
                >
                  <MessageResponse className="message-response-transparent-code-blocks text-sm leading-relaxed break-words">
                    {buildCodeFence(codeInput, 'JavaScript')}
                  </MessageResponse>
                </div>
              </div>
              {stdout.length > 0 ? (
                <div className="min-w-0 max-w-full overflow-hidden">
                  <div data-testid="message-code-exec-stdout">
                    <MessageResponse className="message-response-transparent-code-blocks text-sm leading-relaxed break-words">
                      {buildCodeFence(stripAutoTitleMetadataComments(stdout), 'Output')}
                    </MessageResponse>
                  </div>
                </div>
              ) : null}
              {stderr.length > 0 ? (
                <div className="min-w-0 max-w-full overflow-hidden">
                  <div data-testid="message-code-exec-stderr">
                    <MessageResponse className="message-response-transparent-code-blocks text-sm leading-relaxed break-words">
                      {buildCodeFence(stripAutoTitleMetadataComments(stderr), 'Output')}
                    </MessageResponse>
                  </div>
                </div>
              ) : null}
              {errorText ? (
                <div className="min-w-0 max-w-full overflow-hidden">
                  <div data-testid="message-code-exec-error">
                    <MessageResponse className="message-response-transparent-code-blocks text-sm leading-relaxed break-words">
                      {buildCodeFence(stripAutoTitleMetadataComments(errorText), 'Error')}
                    </MessageResponse>
                  </div>
                </div>
              ) : null}
            </ToolContent>
          </Tool>
        </Message>
      );
    }

    const toolName = toolPart.toolName;

    return (
      <Message from="assistant" className="w-full max-w-full">
        <Tool data-testid="message-tool-call">
          <ToolHeader
            data-testid="message-tool-call-header"
            title={toolName}
            toolName={toolName}
            type="dynamic-tool"
            state={toolPart.state}
          />
          <ToolContent>
            <ToolInput data-testid="message-tool-call-input" input={toolPart.input ?? {}} />
            {toolPart.state === 'output-available' || toolPart.state === 'output-error' ? (
              <ToolOutput
                data-testid="message-tool-call-output"
                output={toolPart.state === 'output-available' ? (toolPart.output ?? {}) : undefined}
                errorText={
                  toolPart.state === 'output-error'
                    ? (toolPart.errorText ?? 'Tool execution failed')
                    : undefined
                }
              />
            ) : null}
          </ToolContent>
        </Tool>
      </Message>
    );
  }

  return null;
}
