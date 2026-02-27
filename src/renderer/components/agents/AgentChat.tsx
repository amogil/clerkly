// Requirements: agents.4, agents.13, llm-integration.2, llm-integration.3, llm-integration.7, llm-integration.8
// Per-agent chat component — mounted at startup, stays mounted forever.
// Scroll position is managed by Conversation (use-stick-to-bottom) — preserved automatically.

import React, { useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAgentChat } from '../../hooks/useAgentChat';
import { AgentMessage } from './AgentMessage';
import { AgentWelcome } from './AgentWelcome';
import { RateLimitBanner } from './RateLimitBanner';
import { AgentDialog } from './AgentDialog';
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
import { Button } from '../ui/button';
import { type StickToBottomContext } from 'use-stick-to-bottom';
import type { AgentSnapshot } from '../../types/agent';

let debugFirstAgentId: string | null = null;

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
  showNotificationPreview: boolean;
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
  showNotificationPreview,
}: AgentChatInnerProps) {
  return (
    <>
      <ConversationContent
        data-testid="messages-area"
        className="flex flex-col gap-4 p-6 justify-end min-h-full"
      >
      {showNotificationPreview && (
        <div className="space-y-3">
          {/* Temporary preview of notification styles — remove after review. */}
          <AgentDialog
            intent="error"
            testId="debug-notification-error"
            approvalId="debug-error"
            message="Invalid API key. Please check your key and try again."
            messageClassName="text-red-700"
            actionsClassName="pt-1"
            actions={
              <Button
                variant="link"
                size="xs"
                className="h-auto p-0 text-red-700 hover:text-red-800"
                onClick={() => onNavigate?.('settings')}
              >
                Open Settings
              </Button>
            }
          />
          <AgentDialog
            intent="info"
            testId="debug-notification-info"
            approvalId="debug-info"
            message="Sync paused. We'll keep trying in the background."
          />
          <AgentDialog
            intent="warning"
            testId="debug-notification-warning"
            approvalId="debug-warning"
            message="Storage is almost full. Clean up files to avoid issues."
          />
          <AgentDialog
            intent="confirmation"
            testId="debug-notification-confirmation"
            approvalId="debug-confirmation"
            message="Confirm this action?"
            actions={
              <>
                <Button size="sm" variant="secondary" onClick={() => undefined}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => undefined}>
                  Confirm
                </Button>
              </>
            }
          />
        </div>
      )}
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
  if (!debugFirstAgentId) {
    debugFirstAgentId = agent.id;
  }
  const showNotificationPreview = debugFirstAgentId === agent.id;

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
          showNotificationPreview={showNotificationPreview}
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
