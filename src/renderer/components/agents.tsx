import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAgents } from '../hooks/useAgents';
import { useMessages } from '../hooks/useMessages';
import { hasError } from '../../shared/utils/agentStatus';
import { AutoExpandingTextareaHandle } from './agents/AutoExpandingTextarea';
import { AgentWelcome } from './agents/AgentWelcome';
import { AgentHeader } from './agents/AgentHeader';
import { AllAgentsPage } from './agents/AllAgentsPage';
import { MessageBubble } from './agents/MessageBubble';
import { ChatInput } from './agents/ChatInput';
import { RateLimitBanner } from './agents/RateLimitBanner';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from './ai-elements/conversation';
import { useEventSubscription } from '../events/useEventSubscription';
import { EVENT_TYPES } from '../../shared/events/constants';
import type { AgentRateLimitPayload } from '../../shared/events/types';
import type { AgentSnapshot } from '../types/agent';

export function Agents({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const [showAllTasksPage, setShowAllTasksPage] = useState(false);
  const [taskInput, setTaskInput] = useState('');
  const [visibleChatsCount, setVisibleChatsCount] = useState(5);
  const [errorMessages, setErrorMessages] = useState<Map<string, string>>(new Map());
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [rateLimitBanner, setRateLimitBanner] = useState<{
    agentId: string;
    userMessageId: number;
    retryAfterSeconds: number;
  } | null>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<AutoExpandingTextareaHandle>(null);
  // chatAreaRef passed to ChatInput for max-height calculation (agents.4.6)
  const chatAreaRef = useRef<HTMLDivElement>(null);

  const { agents, activeAgent, createAgent, selectAgent, isLoading } = useAgents();
  const { messages, sendMessage } = useMessages(activeAgent?.id || null);

  const selectedAgent = activeAgent || agents[0];

  // Subscribe to rate limit events — show countdown banner
  // Requirements: llm-integration.3.7
  useEventSubscription(EVENT_TYPES.AGENT_RATE_LIMIT, (payload: AgentRateLimitPayload) => {
    if (activeAgent && payload.agentId === activeAgent.id) {
      setRateLimitBanner({
        agentId: payload.agentId,
        userMessageId: payload.userMessageId,
        retryAfterSeconds: payload.retryAfterSeconds,
      });
    }
  });

  // Requirements: agents.1.4.4
  useEffect(() => {
    if (!isLoading && agents.length > 0 && isInitialLoad) {
      setIsInitialLoad(false);
    }
  }, [isLoading, agents.length, isInitialLoad]);

  // Requirements: agents.4.7.1, agents.4.7.2
  useEffect(() => {
    if (activeAgent && textareaRef.current && !showAllTasksPage) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [activeAgent, showAllTasksPage]);

  // Calculate visible chats based on container width
  useEffect(() => {
    const calculate = () => {
      if (!chatListRef.current) return;
      const maxChats = Math.floor((chatListRef.current.offsetWidth - 80) / 40);
      setVisibleChatsCount(Math.max(1, maxChats));
    };
    const rafId = requestAnimationFrame(calculate);
    window.addEventListener('resize', calculate);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', calculate);
    };
  }, []);

  useEffect(() => {
    if (!chatListRef.current) return;
    const maxChats = Math.floor((chatListRef.current.offsetWidth - 80) / 40);
    setVisibleChatsCount(Math.max(1, maxChats));
  }, [agents.length]);

  // Requirements: agents.4.13.4, agents.4.14.6
  const handleSend = async (text?: string) => {
    const messageText = text || taskInput;
    if (!messageText.trim() || !activeAgent) return;
    const success = await sendMessage(messageText);
    if (success) {
      setTaskInput('');
    }
  };

  const handleAgentClick = (agent: AgentSnapshot) => {
    selectAgent(agent.id);
    setShowAllTasksPage(false);
  };

  const handleNewChat = async () => {
    const newAgent = await createAgent();
    if (newAgent) setShowAllTasksPage(false);
  };

  // Requirements: agents.5.5, realtime-events.9
  useEffect(() => {
    if (!showAllTasksPage) return;

    async function loadErrorMessages() {
      const errors = new Map<string, string>();
      for (const agent of agents) {
        if (hasError(agent.status)) {
          try {
            const response = await window.api.messages.getLast(agent.id);
            if (response.success && response.data) {
              const message = response.data as {
                payload: { data?: { result?: { error?: { message?: string } } } };
              };
              errors.set(agent.id, message.payload.data?.result?.error?.message || 'Unknown error');
            }
          } catch (error) {
            console.error(`Failed to load error message for agent ${agent.id}:`, error);
          }
        }
      }
      setErrorMessages(errors);
    }

    loadErrorMessages();
  }, [showAllTasksPage, agents]);

  // Requirements: agents.2.7
  if (isLoading || agents.length === 0) return null;

  if (showAllTasksPage) {
    return (
      <AllAgentsPage
        agents={agents}
        errorMessages={errorMessages}
        onBack={() => setShowAllTasksPage(false)}
        onAgentClick={handleAgentClick}
      />
    );
  }

  // Requirements: agents.2.7, agents.2.10, agents.2.11
  const currentAgent = selectedAgent || agents[0]!;

  return (
    <div data-testid="agents" className="h-[calc(100vh-4rem)] bg-card flex flex-col">
      <AgentHeader
        currentAgent={currentAgent}
        agents={agents}
        visibleChatsCount={visibleChatsCount}
        isInitialLoad={isInitialLoad}
        chatListRef={chatListRef}
        onNewChat={handleNewChat}
        onAgentClick={handleAgentClick}
        onShowAllAgents={() => setShowAllTasksPage(true)}
      />

      {/* Requirements: agents.4.13.8-11 — Conversation manages autoscroll via use-stick-to-bottom */}
      {/* key=agentId remounts Conversation on agent switch — resets scroll to bottom for new agents */}
      <Conversation key={currentAgent.id} className="flex-1 min-h-0">
        <ConversationContent
          data-testid="messages-area"
          className="flex flex-col gap-4 p-6 justify-end min-h-full"
        >
          {messages.length === 0 ? (
            <AgentWelcome onPromptClick={(p) => handleSend(p)} />
          ) : (
            messages.map((message, index) => {
              const showAvatar =
                message.kind !== 'user' && (index === 0 || messages[index - 1]?.kind === 'user');

              return (
                <motion.div
                  key={message.id}
                  data-testid="message"
                  data-message-id={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                >
                  <MessageBubble
                    message={message}
                    showAvatar={showAvatar}
                    agentStatus={currentAgent.status}
                    onNavigate={onNavigate}
                  />
                </motion.div>
              );
            })
          )}
        </ConversationContent>

        {rateLimitBanner && rateLimitBanner.agentId === currentAgent.id && (
          <RateLimitBanner
            agentId={rateLimitBanner.agentId}
            userMessageId={rateLimitBanner.userMessageId}
            retryAfterSeconds={rateLimitBanner.retryAfterSeconds}
            onDismiss={() => setRateLimitBanner(null)}
          />
        )}

        <ConversationScrollButton />
      </Conversation>

      <div ref={chatAreaRef} className="flex-shrink-0">
        <ChatInput
          value={taskInput}
          onChange={setTaskInput}
          onSubmit={handleSend}
          disabled={!activeAgent}
          textareaRef={textareaRef}
          chatAreaRef={chatAreaRef}
        />
      </div>
    </div>
  );
}
