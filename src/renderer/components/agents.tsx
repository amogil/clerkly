import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAgents } from '../hooks/useAgents';
import { useMessages } from '../hooks/useMessages';
import { hasError } from '../../shared/utils/agentStatus';
import { AutoExpandingTextareaHandle } from './agents/AutoExpandingTextarea';
import { AgentWelcome } from './agents/AgentWelcome';
import { ScrollArea } from './ui/scroll-area';
import { AgentHeader } from './agents/AgentHeader';
import { AllAgentsPage } from './agents/AllAgentsPage';
import { MessageBubble } from './agents/MessageBubble';
import { ChatInput } from './agents/ChatInput';
import { RateLimitBanner } from './agents/RateLimitBanner';
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
  const messagesAreaRef = useRef<HTMLDivElement | null>(
    null
  ) as React.MutableRefObject<HTMLDivElement | null>;
  const scrollAreaRootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<AutoExpandingTextareaHandle>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [scrollbarHidden, setScrollbarHidden] = useState(false);

  const { agents, activeAgent, createAgent, selectAgent, isLoading } = useAgents();
  const { messages, sendMessage } = useMessages(activeAgent?.id || null);

  const selectedAgent = activeAgent || agents[0];
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Requirements: agents.4.14.5
  const scrollPositions = useRef<Map<string, number>>(new Map());
  // Flag: user just sent a message — scroll unconditionally on next agent message
  const shouldScrollOnNextMessage = useRef(false);

  // Callback ref for viewport — sets CSS variable for min-height
  const viewportCallbackRef = (node: HTMLDivElement | null) => {
    messagesAreaRef.current = node;
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (node) {
      const updateHeight = () => {
        node.style.setProperty('--viewport-height', `${node.clientHeight}px`);
      };
      updateHeight();
      resizeObserverRef.current = new ResizeObserver(updateHeight);
      resizeObserverRef.current.observe(node);
    }
  };

  // Requirements: agents.4.13.5, agents.4.14.4, agents.4.14.8
  const scrollToBottom = (instant = false) => {
    setScrollbarHidden(true);
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
    setTimeout(() => setScrollbarHidden(false), instant ? 50 : 500);
  };

  // Requirements: agents.4.13.2, agents.4.13.3
  const isUserAtBottom = (): boolean => {
    if (!messagesAreaRef.current) return true;
    const { scrollHeight, scrollTop, clientHeight } = messagesAreaRef.current;
    return scrollHeight - scrollTop - clientHeight < clientHeight / 3;
  };

  // Requirements: agents.4.14.1
  const handleScroll = () => {
    if (!messagesAreaRef.current || !activeAgent) return;
    scrollPositions.current.set(activeAgent.id, messagesAreaRef.current.scrollTop);
    // If user manually scrolled away from bottom, cancel the pending autoscroll
    if (shouldScrollOnNextMessage.current && !isUserAtBottom()) {
      shouldScrollOnNextMessage.current = false;
    }
  };

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

  // Requirements: agents.4.13.1, agents.4.13.2
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    // Always scroll when user sends (flag set in handleSend)
    // Keep flag alive until agent responds (non-user message arrives)
    if (shouldScrollOnNextMessage.current) {
      if (lastMessage?.kind !== 'user') {
        shouldScrollOnNextMessage.current = false;
      }
      scrollToBottom();
    } else if (isUserAtBottom()) {
      scrollToBottom();
    }
  }, [messages]);

  // Track which agents have had their scroll position restored on current visit
  const restoredAgents = useRef<Set<string>>(new Set());

  // Requirements: agents.4.14.2, agents.4.14.3, agents.4.14.4, agents.4.14.7, agents.4.14.8
  useEffect(() => {
    if (!messagesAreaRef.current || !activeAgent || messages.length === 0) return;
    if (restoredAgents.current.has(activeAgent.id)) return;
    restoredAgents.current.add(activeAgent.id);
    const savedPosition = scrollPositions.current.get(activeAgent.id);
    if (savedPosition !== undefined) {
      setScrollbarHidden(true);
      messagesAreaRef.current.scrollTop = savedPosition;
      setTimeout(() => setScrollbarHidden(false), 50);
    } else {
      scrollToBottom(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgent?.id, messages]);

  // Reset restored flag when switching away from agent so position restores on return
  useEffect(() => {
    return () => {
      // On unmount or agent change, clear all restored flags to allow re-restoration
      restoredAgents.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgent?.id]);

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
      scrollPositions.current.delete(activeAgent.id);
      shouldScrollOnNextMessage.current = true;
      scrollToBottom();
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

      {/* Requirements: agents.4.13.8-11 */}
      <ScrollArea
        ref={scrollAreaRootRef}
        className={`flex-1 min-h-0${scrollbarHidden ? ' scrollbar-hidden' : ''}`}
        scrollHideDelay={1000}
        viewportRef={viewportCallbackRef}
        viewportProps={{ 'data-testid': 'messages-area' } as React.ComponentProps<'div'>}
        onScrollCapture={handleScroll}
      >
        <div
          className="flex flex-col justify-end space-y-4 p-6"
          style={{ minHeight: 'var(--viewport-height, 100%)' }}
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
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <ChatInput
        value={taskInput}
        onChange={setTaskInput}
        onSubmit={handleSend}
        disabled={!activeAgent}
        textareaRef={textareaRef}
        chatAreaRef={messagesAreaRef}
      />

      {rateLimitBanner && rateLimitBanner.agentId === currentAgent.id && (
        <RateLimitBanner
          agentId={rateLimitBanner.agentId}
          userMessageId={rateLimitBanner.userMessageId}
          retryAfterSeconds={rateLimitBanner.retryAfterSeconds}
          onDismiss={() => setRateLimitBanner(null)}
        />
      )}
    </div>
  );
}
