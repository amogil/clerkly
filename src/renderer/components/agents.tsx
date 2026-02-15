import { useState, useRef, useEffect } from 'react';
import { Send, Check, X, HelpCircle, ArrowLeft, Plus } from 'lucide-react';
import { Logo } from './logo';
import { useAgents } from '../hooks/useAgents';
import { useMessages } from '../hooks/useMessages';
import { computeAgentStatus } from '../../shared/utils/computeAgentStatus';
import {
  isInProgress,
  isAwaitingUser,
  hasError,
  isCompleted,
  getStatusText,
  getStatusStyles,
} from '../../shared/utils/agentStatus';
import type { Agent } from '../types/agent';
import type { AgentStatus } from '../../shared/utils/agentStatus';

// Map Agent to display format with computed status
interface DisplayAgentItem extends Agent {
  status: AgentStatus;
  title: string;
  description: string;
}

export function Agents() {
  const [showAllTasksPage, setShowAllTasksPage] = useState(false);
  const [taskInput, setTaskInput] = useState('');
  const [visibleChatsCount, setVisibleChatsCount] = useState(5);
  const chatListRef = useRef<HTMLDivElement>(null);

  // Use real hooks for agents and messages
  const { agents, activeAgent, createAgent, selectAgent, isLoading } = useAgents();
  const { messages, sendMessage } = useMessages(activeAgent?.agentId || null);

  // Convert agents to display format with computed status
  const displayAgents: DisplayAgentItem[] = agents.map((agent) => {
    // Compute status from messages for this agent
    // For now, use 'new' as default since we don't have messages loaded for all agents
    const status =
      activeAgent?.agentId === agent.agentId
        ? computeAgentStatus(messages.map((m) => ({ payloadJson: m.payloadJson })))
        : 'new';

    return {
      ...agent,
      status,
      title: agent.name || 'New conversation',
      description: status === 'new' ? 'Start chatting with the agent' : `Status: ${status}`,
    };
  });

  // Current selected agent
  const selectedAgent = activeAgent
    ? displayAgents.find((t) => t.agentId === activeAgent.agentId) || displayAgents[0]
    : displayAgents[0];

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

    calculateVisibleChats();
    window.addEventListener('resize', calculateVisibleChats);

    return () => window.removeEventListener('resize', calculateVisibleChats);
  }, []);

  const handleSend = async () => {
    if (!taskInput.trim() || !activeAgent) return;

    const success = await sendMessage(taskInput);
    if (success) {
      setTaskInput('');
    }
  };

  const handleAgentClick = (task: DisplayAgentItem) => {
    selectAgent(task.agentId);
    setShowAllTasksPage(false);
  };

  const handleNewChat = async () => {
    const newAgent = await createAgent();
    if (newAgent) {
      setShowAllTasksPage(false);
    }
  };

  // Requirements: agents.2.7 - Prevent crash during initial load
  // Don't render until we have at least one agent (invariant guarantees this after loading)
  if (isLoading || displayAgents.length === 0) {
    return null;
  }

  // Render agent history page
  if (showAllTasksPage) {
    const historyAgents = displayAgents.filter(
      (agent) => !(agent.title === 'New conversation' && agent.status === 'new')
    );

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
            <h3 className="text-lg font-semibold text-foreground">Agent History</h3>
            <p className="text-xs text-muted-foreground">{historyAgents.length} total agents</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {historyAgents.map((agent) => {
            const letter = agent.title.charAt(0).toUpperCase();
            const style = getStatusStyles(agent.status);

            return (
              <div
                key={agent.agentId}
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
                    <h4 className="font-medium text-foreground mb-1">{agent.title}</h4>
                    <p className="text-sm text-muted-foreground mb-2">{agent.description}</p>

                    <div className="flex items-center gap-3 text-xs">
                      <div className={`${style.text}`}>
                        <span>{getStatusText(agent.status)}</span>
                      </div>
                      <div className="text-muted-foreground">
                        <span>·</span>
                        <span className="ml-1.5">
                          {new Date(agent.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
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
  // The invariant ensures there's always at least one agent
  // If selectedAgent is null (impossible after loading due to invariant), use first agent
  const currentAgent = selectedAgent || displayAgents[0];

  const letter = currentAgent.title.charAt(0).toUpperCase();
  const style = getStatusStyles(currentAgent.status);

  return (
    <div data-testid="agents" className="h-[calc(100vh-4rem)] bg-card flex flex-col">
      {/* Combined Header with Chat List */}
      <div className="h-16 px-6 border-b border-border flex items-center gap-6 flex-shrink-0">
        {/* Left: Task Title - 50% */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
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
            <h3 className="font-semibold text-foreground truncate">{currentAgent.title}</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className={`${style.text}`}>{getStatusText(currentAgent.status)}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground truncate">
                {new Date(currentAgent.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Chat List - 50% */}
        <div ref={chatListRef} className="flex-1 flex items-center gap-2 justify-end">
          <div
            onClick={handleNewChat}
            className="w-8 h-8 rounded-full bg-sky-400 flex items-center justify-center cursor-pointer hover:bg-sky-500 transition-colors group"
            title="New chat"
          >
            <Plus className="w-4 h-4 text-white" />
          </div>

          {displayAgents.slice(0, visibleChatsCount).map((agent) => {
            const agentLetter = agent.title.charAt(0).toUpperCase();
            const agentStyle = getStatusStyles(agent.status);
            const isSelected = agent.agentId === currentAgent.agentId;

            return (
              <div
                key={agent.agentId}
                onClick={() => handleAgentClick(agent)}
                className={`relative w-8 h-8 rounded-full ${agentStyle.bg} flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                title={agent.title}
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

                <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg">
                  <p className="font-semibold mb-1">{agent.title}</p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-300">
                    <span>{getStatusText(agent.status)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {displayAgents.length > visibleChatsCount && (
            <div
              onClick={() => setShowAllTasksPage(true)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
            >
              +{displayAgents.length - visibleChatsCount}
            </div>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message, index) => {
          const showAvatar =
            message.payload.kind !== 'user' &&
            (index === 0 || messages[index - 1].payload.kind === 'user');

          return (
            <div key={message.id}>
              {message.payload.kind === 'user' ? (
                <div className="flex justify-end">
                  <div className="rounded-lg border-2 border-primary bg-primary/5 px-4 py-3">
                    <p className="text-sm leading-relaxed text-foreground text-right">
                      {message.payload.data.text || ''}
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
                  <div className="max-w-[85%] text-sm leading-relaxed text-foreground">
                    {message.payload.data.text || ''}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-card flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask, reply, or give command..."
            className="flex-1 px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleSend}
            disabled={!taskInput.trim()}
            className="px-3.5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 px-0.5">Press Enter to send</p>
      </div>
    </div>
  );
}
