// Requirements: agents.4, agents.13, llm-integration.2, llm-integration.3, llm-integration.7, llm-integration.8
// Per-agent chat component — mounted at startup, stays mounted forever.
// Scroll position is managed by Conversation (use-stick-to-bottom) — preserved automatically.

import React, { useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAgentChat } from '../../hooks/useAgentChat';
import { AgentMessage } from './AgentMessage';
import { AgentWelcome } from './AgentWelcome';
import { RateLimitBanner } from './RateLimitBanner';
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
  onNavigate?: (screen: string) => void;
}

interface AgentChatInnerProps {
  agent: AgentSnapshot;
  rateLimitBanner: RateLimitState | null;
  onRateLimitDismiss: () => void;
  rawMessages: ReturnType<typeof useAgentChat>['rawMessages'];
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
          rawMessages.map((message, index) => {
            const showAvatar =
              message.kind !== 'user' && (index === 0 || rawMessages[index - 1]?.kind === 'user');
            return (
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
                  showAvatar={showAvatar}
                  agentStatus={agent.status}
                  onNavigate={onNavigate}
                />
              </motion.div>
            );
          })
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
  onNavigate,
}: AgentChatProps) {
  const { rawMessages, sendMessage, isLoading } = useAgentChat(agent.id);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickContextRef = useRef<StickToBottomContext | null>(null);
  const lastScrollTopRef = useRef<number | null>(null);
  const hasAutoScrolledRef = useRef(false);

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

  // Requirements: agents.4.14.1, agents.4.14.4 — restore scroll per agent,
  // and auto-scroll only on first active load.
  useEffect(() => {
    const scrollEl = stickContextRef.current?.scrollRef?.current;
    if (!isActive) {
      if (scrollEl) lastScrollTopRef.current = scrollEl.scrollTop;
      return;
    }

    let cancelled = false;
    const attempt = () => {
      if (cancelled) return;
      const context = stickContextRef.current;
      const activeScrollEl = context?.scrollRef?.current;
      if (!activeScrollEl) {
        requestAnimationFrame(attempt);
        return;
      }

      if (!hasAutoScrolledRef.current && rawMessages.length > 0) {
        activeScrollEl.scrollTop = context.state.targetScrollTop;
        context.scrollToBottom('instant');
        hasAutoScrolledRef.current = true;
        return;
      }

      if (lastScrollTopRef.current !== null) {
        activeScrollEl.scrollTop = lastScrollTopRef.current;
      }
    };

    attempt();
    return () => {
      cancelled = true;
    };
  }, [isActive, rawMessages.length]);

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

  return (
    // Hidden via CSS — NOT unmounted — absolute+opacity-0 keeps scrollTop intact (agents.13.5, agents.4.14)
    <div
      className={`flex flex-col flex-1 min-h-0${isActive ? '' : ' absolute inset-0 opacity-0 pointer-events-none'}`}
    >
      {/* Conversation manages autoscroll via use-stick-to-bottom (agents.4.13) */}
      <Conversation className="flex-1 min-h-0" contextRef={stickContextRef}>
        <AgentChatInner
          agent={agent}
          rateLimitBanner={rateLimitBanner}
          onRateLimitDismiss={onRateLimitDismiss}
          rawMessages={rawMessages}
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
            <PromptInputSubmit />
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
