// Requirements: agents.4, agents.13, llm-integration.2, llm-integration.3, llm-integration.7, llm-integration.8
// Per-agent chat component — mounted at startup, stays mounted forever.
// Scroll position is managed by Conversation (use-stick-to-bottom) — preserved automatically.

import React, { useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CornerDownLeft, Square } from 'lucide-react';
import { useAgentChat } from '../../hooks/useAgentChat';
import { AgentMessage } from './AgentMessage';
import { AgentWelcome } from './AgentWelcome';
import { RateLimitBanner } from './RateLimitBanner';
import { Button } from '../ui/button';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '../ai-elements/conversation';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from '../ai-elements/prompt-input';
import { type StickToBottomContext } from 'use-stick-to-bottom';
import type { AgentSnapshot } from '../../types/agent';

interface RateLimitState {
  agentId: string;
  userMessageId: number;
  retryAfterSeconds: number;
}

interface AgentChatProps {
  agent: AgentSnapshot;
  isActive: boolean;
  rateLimitBanner: RateLimitState | null;
  onRateLimitDismiss: () => void;
  onLoadingChange: (agentId: string, isLoading: boolean) => void;
  onStartupSettledChange: (agentId: string, isSettled: boolean) => void;
  onNavigate?: (screen: string) => void;
}

interface AgentChatInnerProps {
  agent: AgentSnapshot;
  rateLimitBanner: RateLimitState | null;
  onRateLimitDismiss: () => void;
  rawMessages: ReturnType<typeof useAgentChat>['rawMessages'];
  streamingReasoningMessageId: number | null;
  onPromptClick: (prompt: string) => Promise<void>;
  onNavigate?: (screen: string) => void;
}

/**
 * Inner component — lives inside <Conversation> so it can access useStickToBottomContext.
 * Does not force manual scroll on send; Conversation controls autoscroll behavior (agents.4.13.2).
 */
function AgentChatInner({
  agent,
  rateLimitBanner,
  onRateLimitDismiss,
  rawMessages,
  streamingReasoningMessageId,
  onPromptClick,
  onNavigate,
}: AgentChatInnerProps) {
  return (
    <>
      <ConversationContent
        data-testid="messages-area"
        className="flex flex-col gap-4 p-6 justify-end min-h-full"
      >
        {rawMessages.length === 0 ? (
          <AgentWelcome onPromptClick={onPromptClick} />
        ) : (
          rawMessages.map((message) => (
            <motion.div
              key={message.id}
              data-testid="message"
              data-message-id={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
              <AgentMessage
                message={message}
                isReasoningStreaming={message.id === streamingReasoningMessageId}
                onNavigate={onNavigate}
              />
            </motion.div>
          ))
        )}
      </ConversationContent>

      {rateLimitBanner && rateLimitBanner.agentId === agent.id && (
        <RateLimitBanner
          agentId={rateLimitBanner.agentId}
          userMessageId={rateLimitBanner.userMessageId}
          retryAfterSeconds={rateLimitBanner.retryAfterSeconds}
          onDismiss={onRateLimitDismiss}
        />
      )}
    </>
  );
}

/**
 * AgentChat — independent chat component per agent.
 * Mounted at app startup, stays mounted forever (agents.13.3).
 * Hidden via absolute+opacity-0 when not active — keeps scrollTop intact (agents.13.5, agents.4.14).
 * Conversation (use-stick-to-bottom) manages scroll position automatically (agents.4.14).
 */
export function AgentChat({
  agent,
  isActive,
  rateLimitBanner,
  onRateLimitDismiss,
  onLoadingChange,
  onStartupSettledChange,
  onNavigate,
}: AgentChatProps) {
  const { rawMessages, sendMessage, cancelCurrentRequest, isLoading, isStreaming } = useAgentChat(
    agent.id
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickContextRef = useRef<StickToBottomContext | null>(null);
  const hasReachedStartupSettledRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Autofocus textarea when this chat becomes active (agents.4.7.1)
  useEffect(() => {
    if (!isActive) return;
    const timeouts = [0, 100, 300, 600].map((delay) =>
      window.setTimeout(() => textareaRef.current?.focus(), delay)
    );
    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [isActive]);

  // Notify parent when loading state changes (agents.13.2, agents.13.10)
  useEffect(() => {
    onLoadingChange(agent.id, isLoading);
  }, [agent.id, isLoading, onLoadingChange]);

  // Requirements: agents.4.14.5, agents.4.14.6, agents.13.2, agents.13.10
  // Mark startup as settled only after the active chat width stops changing for a short window.
  // This prevents showing chat during late startup reflow/scrollbar-induced width jumps.
  useEffect(() => {
    if (hasReachedStartupSettledRef.current) return;
    if (!isActive || isLoading) {
      onStartupSettledChange(agent.id, false);
      return;
    }

    const startupSettleDelayMs = 250;
    const minScrollDeltaForReschedulePx = 24;
    let settleTimeoutId: number | null = null;
    let raf1: number | null = null;
    let raf2: number | null = null;
    let settled = false;
    let cleanupDone = false;
    let resizeObserver: ResizeObserver | null = null;
    let scrollListenerNode: HTMLElement | null = null;
    let onScrollHandler: (() => void) | null = null;
    let lastScheduledScrollTop: number | null = null;

    const cleanupRuntime = () => {
      if (cleanupDone) return;
      cleanupDone = true;
      resizeObserver?.disconnect();
      if (scrollListenerNode && onScrollHandler) {
        scrollListenerNode.removeEventListener('scroll', onScrollHandler);
      }
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
      if (raf1 !== null) {
        window.cancelAnimationFrame(raf1);
      }
      if (raf2 !== null) {
        window.cancelAnimationFrame(raf2);
      }
    };

    const markSettled = () => {
      if (settled) return;
      settled = true;
      hasReachedStartupSettledRef.current = true;
      cleanupRuntime();
      onStartupSettledChange(agent.id, true);
    };

    const scheduleSettle = () => {
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
      settleTimeoutId = window.setTimeout(() => {
        // Two RAF ticks ensure paint/layout flush after the final resize event.
        raf1 = window.requestAnimationFrame(() => {
          raf2 = window.requestAnimationFrame(() => {
            markSettled();
          });
        });
      }, startupSettleDelayMs);
    };

    const root = rootRef.current;
    const messagesArea = root?.querySelector('[data-testid="messages-area"]');
    const observedNode = (messagesArea?.parentElement ?? messagesArea) as Element | null;
    const scrollNode =
      observedNode instanceof HTMLElement
        ? observedNode
        : observedNode?.parentElement instanceof HTMLElement
          ? observedNode.parentElement
          : null;

    scheduleSettle();

    if (typeof ResizeObserver === 'undefined' || !observedNode) {
      // Fallback for environments without ResizeObserver (e.g., some tests).
      return () => {
        cleanupRuntime();
      };
    }

    resizeObserver = new ResizeObserver(() => {
      scheduleSettle();
    });
    resizeObserver.observe(observedNode);
    onScrollHandler = () => {
      const top = scrollNode?.scrollTop ?? 0;
      if (
        lastScheduledScrollTop !== null &&
        Math.abs(top - lastScheduledScrollTop) < minScrollDeltaForReschedulePx
      ) {
        return;
      }
      lastScheduledScrollTop = top;
      scheduleSettle();
    };
    scrollListenerNode = scrollNode;
    scrollListenerNode?.addEventListener('scroll', onScrollHandler, { passive: true });

    return () => {
      cleanupRuntime();
    };
  }, [agent.id, isActive, isLoading, onStartupSettledChange]);

  // Reserve scrollbar gutter to prevent width jump when vertical scrollbar appears/disappears.
  // Requirements: agents.4.14.5, agents.4.14.6
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const messagesArea = root.querySelector('[data-testid="messages-area"]');
    const scrollContainer = messagesArea?.parentElement as HTMLElement | null;
    if (!scrollContainer) return;

    const previousScrollbarGutter = scrollContainer.style.scrollbarGutter;
    scrollContainer.style.scrollbarGutter = 'stable';

    return () => {
      scrollContainer.style.scrollbarGutter = previousScrollbarGutter;
    };
  }, []);

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const messageText = message.text?.trim();
      if (!messageText) return;
      await sendMessage(messageText);
    },
    [sendMessage]
  );

  const handlePromptClick = useCallback(
    async (prompt: string) => {
      await sendMessage(prompt);
    },
    [sendMessage]
  );

  const handleStop = useCallback(async () => {
    await cancelCurrentRequest();
  }, [cancelCurrentRequest]);

  const streamingReasoningMessageId = (() => {
    if (!isStreaming) return null;
    for (let index = rawMessages.length - 1; index >= 0; index -= 1) {
      const message = rawMessages[index];
      if (!message) continue;
      if (message.kind !== 'llm' || message.hidden) continue;
      const llmData = message.payload.data as
        | { reasoning?: { text?: string }; action?: { content?: string } }
        | undefined;
      const hasReasoning = Boolean(llmData?.reasoning?.text);
      const hasAction = Boolean(llmData?.action?.content);
      if (hasReasoning && !hasAction) return message.id;
    }
    return null;
  })();

  // Stop/send mode is driven only by agent status.
  // Requirements: agents.4.24, agents.4.24.4
  const isInProgress = agent.status === 'in-progress';

  return (
    // Hidden via CSS — NOT unmounted — absolute+opacity-0 keeps scrollTop intact (agents.13.5, agents.4.14)
    <div
      ref={rootRef}
      data-testid="agent-chat-root"
      data-active={isActive ? 'true' : 'false'}
      className={`flex flex-col flex-1 min-h-0${isActive ? '' : ' absolute inset-0 opacity-0 pointer-events-none'}`}
    >
      <Conversation className="flex-1 min-h-0" contextRef={stickContextRef}>
        <AgentChatInner
          agent={agent}
          rateLimitBanner={rateLimitBanner}
          onRateLimitDismiss={onRateLimitDismiss}
          rawMessages={rawMessages}
          streamingReasoningMessageId={streamingReasoningMessageId}
          onPromptClick={handlePromptClick}
          onNavigate={onNavigate}
        />
        <ConversationScrollButton data-testid="scroll-to-bottom" />
      </Conversation>
      <div className="flex-shrink-0">
        <PromptInput className="mt-2" onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              ref={textareaRef}
              data-testid="auto-expanding-textarea"
              placeholder="Ask, reply, or give command..."
            />
            {isInProgress ? (
              <Button
                className="h-10 w-10 shrink-0 p-0"
                data-testid="prompt-input-stop"
                onClick={() => void handleStop()}
                type="button"
              >
                <Square className="h-4 w-4 fill-current" />
                <span className="sr-only">Stop generation</span>
              </Button>
            ) : (
              <PromptInputSubmit data-testid="prompt-input-send">
                <CornerDownLeft className="h-4 w-4" />
              </PromptInputSubmit>
            )}
          </PromptInputBody>
          <PromptInputFooter>
            <p className="px-0.5 text-xs text-muted-foreground">
              Press Enter to send, Shift+Enter for new line
            </p>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
