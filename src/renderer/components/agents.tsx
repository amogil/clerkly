// Requirements: agents.1, agents.2, agents.3, agents.4, agents.5, agents.6, agents.12, agents.13
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAgents } from '../hooks/useAgents';
import { hasError } from '../../shared/utils/agentStatus';
import { AgentHeader } from './agents/AgentHeader';
import { AgentChat } from './agents/AgentChat';
import { AllAgentsPage } from './agents/AllAgentsPage';
import { useEventSubscription } from '../events/useEventSubscription';
import { EVENT_TYPES } from '../../shared/events/constants';
import type { AgentRateLimitPayload } from '../../shared/events/types';
import type { AgentSnapshot } from '../types/agent';

export function Agents({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const [showAllTasksPage, setShowAllTasksPage] = useState(false);
  const [visibleChatsCount, setVisibleChatsCount] = useState(5);
  const [errorMessages, setErrorMessages] = useState<Map<string, string>>(new Map());
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [rateLimitBanner, setRateLimitBanner] = useState<{
    agentId: string;
    userMessageId: number;
    retryAfterSeconds: number;
  } | null>(null);
  // Track loading state per agent — show loader until all chats loaded (agents.13.2, agents.13.10)
  const [loadingAgents, setLoadingAgents] = useState<Set<string>>(new Set());

  const chatListRef = useRef<HTMLDivElement>(null);

  const { agents, activeAgent, createAgent, selectAgent, isLoading } = useAgents();

  // Subscribe to rate limit events (llm-integration.3.7)
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

  // Calculate visible chats based on container width (agents.1.7)
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

  // Track per-agent loading state for global startup loader (agents.13.2, agents.13.10)
  const handleLoadingChange = useCallback((agentId: string, loading: boolean) => {
    setLoadingAgents((prev) => {
      const next = new Set(prev);
      if (loading) next.add(agentId);
      else next.delete(agentId);
      return next;
    });
  }, []);

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

  const currentAgent = activeAgent || agents[0]!;
  // Show loader while any AgentChat is still loading its initial chunk (agents.13.2, agents.13.10)
  const allChatsLoaded = loadingAgents.size === 0;

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

      {/* Startup loader — shown until all AgentChat components finish loading (agents.13.2) */}
      {!allChatsLoaded && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      )}

      {/* All AgentChat components mounted at startup — CSS show/hide on agent switch (agents.13.3, agents.13.5) */}
      <div className={`flex-1 min-h-0 flex flex-col${allChatsLoaded ? '' : ' hidden'}`}>
        {agents.map((agent) => (
          <AgentChat
            key={agent.id}
            agent={agent}
            isActive={agent.id === currentAgent.id}
            rateLimitBanner={rateLimitBanner}
            onRateLimitDismiss={() => setRateLimitBanner(null)}
            onLoadingChange={handleLoadingChange}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}
