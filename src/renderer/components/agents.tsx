import { useState, useRef, useEffect } from 'react';
import { Send, Check, X, HelpCircle, ArrowLeft, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from './logo';
import { useAgents } from '../hooks/useAgents';
import { useMessages } from '../hooks/useMessages';
import {
  isInProgress,
  isAwaitingUser,
  hasError,
  isCompleted,
  isNew,
  getStatusText,
  getStatusStyles,
} from '../../shared/utils/agentStatus';
import { AutoExpandingTextarea, AutoExpandingTextareaHandle } from './agents/AutoExpandingTextarea';
import { EmptyStatePlaceholder } from './agents/EmptyStatePlaceholder';
import { ScrollArea } from './ui/scroll-area';
import { DateTimeFormatter } from '../../utils/DateTimeFormatter';
import type { AgentSnapshot } from '../types/agent';

// Helper function to get agent name with fallback
// Requirements: agents.2.1 - Display agent name or default
const getAgentName = (agent: AgentSnapshot): string => agent.name || 'New Agent';

export function Agents() {
  const [showAllTasksPage, setShowAllTasksPage] = useState(false);
  const [taskInput, setTaskInput] = useState('');
  const [visibleChatsCount, setVisibleChatsCount] = useState(5);
  const [errorMessages, setErrorMessages] = useState<Map<string, string>>(new Map());
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const chatListRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement | null>(
    null
  ) as React.MutableRefObject<HTMLDivElement | null>;
  const scrollAreaRootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<AutoExpandingTextareaHandle>(null);
  // Track ResizeObserver for cleanup
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Callback ref for viewport to set CSS variable immediately when ref is attached
  const viewportCallbackRef = (node: HTMLDivElement | null) => {
    messagesAreaRef.current = node;
    // Cleanup previous observer
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
  // Temporarily switch ScrollArea type to suppress scrollbar during programmatic scroll
  const [scrollAreaType, setScrollAreaType] = useState<'scroll' | 'hover'>('scroll');

  // Use real hooks for agents and messages
  const { agents, activeAgent, createAgent, selectAgent, isLoading } = useAgents();
  const { messages, sendMessage } = useMessages(activeAgent?.id || null);

  // Current selected agent
  const selectedAgent = activeAgent || agents[0];

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Requirements: agents.4.14.5
  const scrollPositions = useRef<Map<string, number>>(new Map());

  // Requirements: agents.4.13.5, agents.4.14.4, agents.4.14.8
  // Suppress scrollbar during programmatic scroll by temporarily switching type
  const scrollToBottom = (instant = false) => {
    setScrollAreaType('hover');
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
    setTimeout(() => setScrollAreaType('scroll'), instant ? 50 : 500);
  };

  // Requirements: agents.4.13.2, agents.4.13.3
  const isUserAtBottom = (): boolean => {
    if (!messagesAreaRef.current) return true;
    const { scrollHeight, scrollTop, clientHeight } = messagesAreaRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom < clientHeight / 3;
  };

  // Requirements: agents.4.14.1 - Save scroll position for active agent
  const handleScroll = () => {
    if (!messagesAreaRef.current || !activeAgent) return;
    const scrollTop = messagesAreaRef.current.scrollTop;
    scrollPositions.current.set(activeAgent.id, scrollTop);
  };

  // Track initial load completion
  // Requirements: agents.1.4.4 - Disable initial animation on first load
  useEffect(() => {
    if (!isLoading && agents.length > 0 && isInitialLoad) {
      // Mark initial load as complete after agents are loaded
      setIsInitialLoad(false);
    }
  }, [isLoading, agents.length, isInitialLoad]);

  // Auto-focus input when active agent changes
  // Requirements: agents.4.7.1, agents.4.7.2
  useEffect(() => {
    if (activeAgent && textareaRef.current && !showAllTasksPage) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [activeAgent, showAllTasksPage]);

  // Requirements: agents.4.13.1, agents.4.13.2
  // Autoscroll when new messages arrive if user is at bottom
  useEffect(() => {
    if (messages.length > 0 && isUserAtBottom()) {
      scrollToBottom();
    }
  }, [messages]);

  // Requirements: agents.4.14.2, agents.4.14.3, agents.4.14.4, agents.4.14.7, agents.4.14.8
  // Restore scroll position when switching agents or scroll to bottom on first visit
  useEffect(() => {
    if (!messagesAreaRef.current || !activeAgent) return;

    const savedPosition = scrollPositions.current.get(activeAgent.id);

    if (savedPosition !== undefined) {
      // Restore saved position instantly (no animation)
      // Suppress scrollbar during programmatic scroll
      setScrollAreaType('hover');
      messagesAreaRef.current.scrollTop = savedPosition;
      setTimeout(() => setScrollAreaType('scroll'), 50);
    } else {
      // First visit - scroll to bottom instantly (no animation)
      scrollToBottom(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgent?.id, messages]);

  // Calculate visible chats based on container width
  useEffect(() => {
    const calculateVisibleChats = () => {
      if (!chatListRef.current) return;

      const containerWidth = chatListRef.current.offsetWidth;
      const availableWidth = containerWidth - 80;
      const chatWidth = 40;
      const maxChats = Math.floor(availableWidth / chatWidth);

      setVisibleChatsCount(Math.max(1, maxChats));
    };

    // Initial calculation with requestAnimationFrame to ensure grid layout is applied
    const rafId = requestAnimationFrame(() => {
      calculateVisibleChats();
    });

    window.addEventListener('resize', calculateVisibleChats);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', calculateVisibleChats);
    };
  }, []);

  // Recalculate when agents list changes
  useEffect(() => {
    if (!chatListRef.current) return;

    const containerWidth = chatListRef.current.offsetWidth;
    const availableWidth = containerWidth - 80;
    const chatWidth = 40;
    const maxChats = Math.floor(availableWidth / chatWidth);

    setVisibleChatsCount(Math.max(1, maxChats));
  }, [agents.length]);

  // Requirements: agents.4.13.4, agents.4.14.6
  const handleSend = async (text?: string) => {
    const messageText = text || taskInput;
    if (!messageText.trim() || !activeAgent) return;

    const success = await sendMessage(messageText);
    if (success) {
      setTaskInput('');
      // Clear saved position and force scroll to bottom
      scrollPositions.current.delete(activeAgent.id);
      scrollToBottom();
    }
  };

  const handlePromptClick = async (prompt: string) => {
    await handleSend(prompt);
  };

  const handleAgentClick = (agent: AgentSnapshot) => {
    selectAgent(agent.id);
    setShowAllTasksPage(false);
  };

  const handleNewChat = async () => {
    const newAgent = await createAgent();
    if (newAgent) {
      setShowAllTasksPage(false);
    }
  };

  // Helper function to extract error message from a message snapshot
  // Requirements: agents.5.5, realtime-events.9
  const getErrorMessage = (message: {
    payload: { kind: string; data?: { result?: { error?: { message?: string } } } };
  }): string => {
    return message.payload.data?.result?.error?.message || 'Unknown error';
  };

  // Load error messages for agents with error status when AllAgents page is shown
  // Requirements: agents.5.5, realtime-events.9
  useEffect(() => {
    if (!showAllTasksPage) {
      return;
    }

    async function loadErrorMessages() {
      const errors = new Map<string, string>();

      for (const agent of agents) {
        if (hasError(agent.status)) {
          try {
            const response = await window.api.messages.getLast(agent.id);
            if (response.success && response.data) {
              // API returns MessageSnapshot with parsed payload
              const message = response.data as {
                payload: { kind: string; data?: { result?: { error?: { message?: string } } } };
              };
              const errorMsg = getErrorMessage(message);
              errors.set(agent.id, errorMsg);
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

  // Requirements: agents.2.7 - Prevent crash during initial load
  // Don't render until we have at least one agent (auto-create guarantees this after loading)
  if (isLoading || agents.length === 0) {
    return null;
  }

  // Render agent history page
  if (showAllTasksPage) {
    const historyAgents = agents.filter((agent) => !(!agent.name && isNew(agent.status)));

    return (
      <div className="h-[calc(100vh-4rem)] bg-card flex flex-col">
        <div className="h-16 px-6 border-b border-border flex items-center gap-4 flex-shrink-0">
          <button
            onClick={() => setShowAllTasksPage(false)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="text-lg font-semibold text-foreground">All Agents</h3>
            <p className="text-xs text-muted-foreground">{historyAgents.length} total agents</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {historyAgents.map((agent) => {
            const agentName = getAgentName(agent);
            const letter = agentName.charAt(0).toUpperCase();
            const style = getStatusStyles(agent.status);

            return (
              <div
                key={agent.id}
                data-testid={`agent-card-${agent.id}`}
                onClick={() => handleAgentClick(agent)}
                className="p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`relative flex-shrink-0 w-10 h-10 rounded-full ${style.bg} flex items-center justify-center`}
                  >
                    {isCompleted(agent.status) ? (
                      <Check className="w-5 h-5 text-white" />
                    ) : hasError(agent.status) ? (
                      <X className="w-5 h-5 text-white" />
                    ) : isAwaitingUser(agent.status) ? (
                      <>
                        <span className="text-white text-sm font-semibold">{letter}</span>
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ${style.bg} border-2 border-card flex items-center justify-center`}
                        >
                          <HelpCircle className="w-2.5 h-2.5 text-white" />
                        </div>
                      </>
                    ) : (
                      <span className="text-white text-sm font-semibold">{letter}</span>
                    )}

                    {isInProgress(agent.status) && (
                      <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    )}

                    {isAwaitingUser(agent.status) && (
                      <div
                        className={`absolute -inset-1 rounded-full ring-2 ${style.ring} animate-pulse`}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground mb-1">{agentName}</h4>

                    <div className="flex items-center gap-3 text-xs">
                      <span className={style.text}>{getStatusText(agent.status)}</span>
                      <div className="text-muted-foreground">
                        <span>·</span>
                        <span className="ml-1.5">
                          {DateTimeFormatter.formatDateTime(new Date(agent.updatedAt))}
                        </span>
                      </div>
                    </div>

                    {/* Requirements: agents.5.5 - Show error message for agents with error status */}
                    {hasError(agent.status) && errorMessages.has(agent.id) && (
                      <p className="text-xs text-red-500 mt-1">{errorMessages.get(agent.id)}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Requirements: agents.2.7, agents.2.10, agents.2.11
  // Auto-create first agent ensures there's always at least one agent
  // currentAgent is guaranteed to be defined after loading due to auto-create
  const currentAgent = selectedAgent || agents[0]!;

  const currentAgentName = getAgentName(currentAgent);
  const letter = currentAgentName.charAt(0).toUpperCase();
  const style = getStatusStyles(currentAgent.status);

  return (
    <div data-testid="agents" className="h-[calc(100vh-4rem)] bg-card flex flex-col">
      {/* Combined Header with Chat List */}
      <div className="h-16 px-6 border-b border-border grid grid-cols-2 gap-6 items-center flex-shrink-0 relative z-[100]">
        {/* Left: Active Agent Info - 50% */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`relative flex-shrink-0 w-10 h-10 rounded-full ${style.bg} flex items-center justify-center`}
          >
            {isCompleted(currentAgent.status) ? (
              <Check className="w-5 h-5 text-white" />
            ) : hasError(currentAgent.status) ? (
              <X className="w-5 h-5 text-white" />
            ) : isAwaitingUser(currentAgent.status) ? (
              <>
                <span className="text-white text-sm font-semibold">{letter}</span>
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ${style.bg} border-2 border-card flex items-center justify-center`}
                >
                  <HelpCircle className="w-2.5 h-2.5 text-white" />
                </div>
              </>
            ) : (
              <span className="text-white text-sm font-semibold">{letter}</span>
            )}

            {isInProgress(currentAgent.status) && (
              <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
            )}

            {isAwaitingUser(currentAgent.status) && (
              <div
                className={`absolute -inset-1 rounded-full ring-2 ${style.ring} animate-pulse`}
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{currentAgentName}</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className={style.text}>{getStatusText(currentAgent.status)}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground truncate" data-testid="agent-header-timestamp">
                {DateTimeFormatter.formatDateTime(new Date(currentAgent.updatedAt))}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Chat List - 50% */}
        <div ref={chatListRef} className="flex items-center gap-2 justify-end">
          <div
            onClick={handleNewChat}
            className="w-8 h-8 rounded-full bg-sky-400 flex items-center justify-center cursor-pointer hover:bg-sky-500 transition-colors group"
            title="New chat"
          >
            <Plus className="w-4 h-4 text-white" />
          </div>

          <AnimatePresence mode="popLayout">
            {agents.slice(0, visibleChatsCount).map((agent) => {
              const agentName = getAgentName(agent);
              const agentLetter = agentName.charAt(0).toUpperCase();
              const agentStyle = getStatusStyles(agent.status);
              const isSelected = agent.id === currentAgent.id;

              return (
                <motion.div
                  key={agent.id}
                  data-testid={`agent-icon-${agent.id}`}
                  layout
                  initial={isInitialLoad ? false : { opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{
                    layout: {
                      type: 'spring',
                      stiffness: 400,
                      damping: 30,
                      mass: 0.8,
                    },
                    opacity: { duration: 0.2 },
                    scale: { duration: 0.2 },
                  }}
                  onClick={() => handleAgentClick(agent)}
                  className={`relative w-8 h-8 rounded-full ${agentStyle.bg} flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                >
                  {isCompleted(agent.status) ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : hasError(agent.status) ? (
                    <X className="w-4 h-4 text-white" />
                  ) : isAwaitingUser(agent.status) ? (
                    <>
                      <span className="text-white text-xs font-semibold">{agentLetter}</span>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${agentStyle.bg} border-2 border-card flex items-center justify-center`}
                      >
                        <HelpCircle className="w-2 h-2 text-white" />
                      </div>
                    </>
                  ) : (
                    <span className="text-white text-xs font-semibold">{agentLetter}</span>
                  )}

                  {isInProgress(agent.status) && (
                    <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  )}

                  {isAwaitingUser(agent.status) && (
                    <div
                      className={`absolute -inset-1 rounded-full ring-2 ${agentStyle.ring} animate-pulse`}
                    />
                  )}

                  <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 delay-0 group-hover:delay-[2000ms] z-[100] shadow-lg pointer-events-none">
                    <p className="font-semibold mb-1">{agentName}</p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-300">
                      <span>{getStatusText(agent.status)}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {agents.length > visibleChatsCount && (
            <div
              onClick={() => setShowAllTasksPage(true)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
            >
              +{agents.length - visibleChatsCount}
            </div>
          )}
        </div>
      </div>

      {/* Messages Area */}
      {/* Requirements: agents.4.13.8-11 - ScrollArea with auto-hide scrollbar */}
      <ScrollArea
        ref={scrollAreaRootRef}
        className="flex-1 min-h-0"
        type={scrollAreaType}
        scrollHideDelay={1000}
        viewportRef={viewportCallbackRef}
        viewportProps={
          {
            'data-testid': 'messages-area',
          } as React.ComponentProps<'div'>
        }
        onScrollCapture={handleScroll}
      >
        <div
          className="flex flex-col justify-end space-y-4 p-6"
          style={{ minHeight: 'var(--viewport-height, 100%)' }}
        >
          {messages.length === 0 ? (
            <EmptyStatePlaceholder onPromptClick={handlePromptClick} />
          ) : (
            messages.map((message, index) => {
              const showAvatar =
                message.payload.kind !== 'user' &&
                (index === 0 || messages[index - 1]?.payload.kind === 'user');

              return (
                <motion.div
                  key={message.id}
                  data-testid="message"
                  data-message-id={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                >
                  {message.payload.kind === 'user' ? (
                    <div className="flex justify-end">
                      <div className="rounded-2xl bg-secondary/70 border border-border px-4 py-3 max-w-[75%]">
                        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                          {String(message.payload.data?.text || '')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {showAvatar && (
                        <div className="mb-2">
                          <Logo
                            size="sm"
                            showText={false}
                            animated={isInProgress(currentAgent.status)}
                          />
                        </div>
                      )}
                      <div className="max-w-[85%] text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                        {String(message.payload.data?.text || '')}
                      </div>
                    </>
                  )}
                </motion.div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-card flex-shrink-0">
        <div className="flex gap-2 items-end">
          <AutoExpandingTextarea
            ref={textareaRef}
            value={taskInput}
            onChange={setTaskInput}
            onSubmit={handleSend}
            chatAreaRef={messagesAreaRef}
            disabled={!activeAgent}
            className="flex-1 px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => handleSend()}
            disabled={!taskInput.trim()}
            className="px-3.5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 px-0.5">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
