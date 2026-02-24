// Requirements: agents.4, agents.13, llm-integration.2, llm-integration.3, llm-integration.7, llm-integration.8
// Per-agent chat component — mounted at startup, stays mounted forever.
// Scroll position is managed by Conversation (use-stick-to-bottom) — preserved automatically.

import React, { useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAgentChat } from '../../hooks/useAgentChat';
import { AgentMessage } from './AgentMessage';
import { AgentPromptInput, AgentPromptInputHandle } from './AgentPromptInput';
import { AgentWelcome } from './AgentWelcome';
import { RateLimitBanner } from './RateLimitBanner';
import {
  Conversation,
  ConversationContent,
} from '../ai-elements/conversation';
import { useStickToBottomContext } from 'use-stick-to-bottom';
import { ArrowDownIcon } from 'lucide-react';
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

/**
 * Scroll-to-bottom button with data-testid for functional tests.
 * Uses useStickToBottomContext from use-stick-to-bottom (same as ConversationScrollButton).
 * Requirements: agents.4.13
 */
function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <button
      data-testid="scroll-to-bottom"
      onClick={() => scrollToBottom()}
      type="button"
      className="absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full border bg-background shadow-sm hover:bg-muted size-8 flex items-center justify-center"
    >
      <ArrowDownIcon className="size-4" />
    </button>
  );
}

/**
 * AgentChat — independent chat component per agent.
 * Mounted at app startup, stays mounted forever (agents.13.3).
 * Hidden via className="hidden" when not active (agents.13.5).
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
  const textareaRef = useRef<AgentPromptInputHandle>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const [taskInput, setTaskInput] = React.useState('');

  const { rawMessages, sendMessage, isLoading, loadMore, hasMore } = useAgentChat(agent.id);

  // Notify parent when loading state changes (agents.13.2, agents.13.10)
  useEffect(() => {
    onLoadingChange(agent.id, isLoading);
  }, [agent.id, isLoading, onLoadingChange]);

  // Autofocus textarea when this chat becomes active (agents.4.7.1)
  useEffect(() => {
    if (isActive) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isActive]);

  const handleSend = useCallback(
    async (text?: string) => {
      const messageText = text || taskInput;
      if (!messageText.trim()) return;
      const success = await sendMessage(messageText);
      if (success) setTaskInput('');
    },
    [taskInput, sendMessage]
  );

  // Load more messages when scrolled to top (agents.13.9)
  // Autoscroll ONLY fires when user is at the bottom — handled by use-stick-to-bottom (agents.4.13.2)
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (hasMore && e.currentTarget.scrollTop < 50) loadMore();
    },
    [hasMore, loadMore]
  );

  return (
    // Hidden via CSS — NOT unmounted — Conversation preserves scroll position automatically (agents.13.5, agents.4.14)
    <div className={`flex flex-col flex-1 min-h-0${isActive ? '' : ' hidden'}`}>
      {/* Conversation manages autoscroll via use-stick-to-bottom (agents.4.13) */}
      <Conversation className="flex-1 min-h-0" onScroll={handleScroll}>
        <ConversationContent
          data-testid="messages-area"
          className="flex flex-col gap-4 p-6 justify-end min-h-full"
        >
          {rawMessages.length === 0 ? (
            <AgentWelcome onPromptClick={(p) => handleSend(p)} />
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

        <ScrollToBottomButton />
      </Conversation>

      <div ref={chatAreaRef} className="flex-shrink-0">
        <AgentPromptInput
          ref={textareaRef}
          value={taskInput}
          onChange={setTaskInput}
          onSubmit={handleSend}
          disabled={false}
          chatAreaRef={chatAreaRef}
        />
      </div>
    </div>
  );
}
