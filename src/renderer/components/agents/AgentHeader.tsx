import React from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { AgentAvatar } from './AgentAvatar';
import { getStatusText, getStatusStyles } from '../../../shared/utils/agentStatus';
import { DateTimeFormatter } from '../../../utils/DateTimeFormatter';
import type { AgentSnapshot } from '../../types/agent';

// Requirements: agents.2.1, agents.4.7, agents.1.4.4

const getAgentName = (agent: AgentSnapshot): string => agent.name || 'New Agent';

interface AgentHeaderProps {
  currentAgent: AgentSnapshot;
  agents: AgentSnapshot[];
  visibleChatsCount: number;
  isInitialLoad: boolean;
  chatListRef: React.RefObject<HTMLDivElement | null>;
  onNewChat: () => void;
  onAgentClick: (agent: AgentSnapshot) => void;
  onShowAllAgents: () => void;
}

export function AgentHeader({
  currentAgent,
  agents,
  visibleChatsCount,
  isInitialLoad,
  chatListRef,
  onNewChat,
  onAgentClick,
  onShowAllAgents,
}: AgentHeaderProps) {
  const currentAgentName = getAgentName(currentAgent);
  const letter = currentAgentName.charAt(0).toUpperCase();
  const style = getStatusStyles(currentAgent.status);

  return (
    <div className="h-16 px-6 border-b border-border grid grid-cols-2 gap-6 items-center flex-shrink-0 relative z-[100]">
      {/* Left: Active Agent Info */}
      <div className="flex items-center gap-3 min-w-0">
        <AgentAvatar status={currentAgent.status} letter={letter} size="md" />

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

      {/* Right: Chat List */}
      <div ref={chatListRef} className="flex items-center gap-2 justify-end">
        <div
          onClick={onNewChat}
          className="w-8 h-8 rounded-full bg-sky-400 flex items-center justify-center cursor-pointer hover:bg-sky-500 transition-colors group"
          title="New chat"
        >
          <Plus className="w-4 h-4 text-white" />
        </div>

        {agents.slice(0, visibleChatsCount).map((agent) => {
          const agentName = getAgentName(agent);
          const agentLetter = agentName.charAt(0).toUpperCase();
          const isSelected = agent.id === currentAgent.id;

          return (
            <motion.div
              key={agent.id}
              data-testid={`agent-icon-${agent.id}`}
              initial={isInitialLoad ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 },
              }}
              onClick={() => onAgentClick(agent)}
              className={`cursor-pointer hover:scale-110 transition-transform group ${isSelected ? 'ring-2 ring-primary ring-offset-2 rounded-full' : ''}`}
            >
              <AgentAvatar status={agent.status} letter={agentLetter} size="sm" />

              <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 delay-0 group-hover:delay-[2000ms] z-[100] shadow-lg pointer-events-none">
                <p className="font-semibold mb-1">{agentName}</p>
                <div className="flex items-center gap-1.5 text-xs text-gray-300">
                  <span>{getStatusText(agent.status)}</span>
                </div>
              </div>
            </motion.div>
          );
        })}

        {agents.length > visibleChatsCount && (
          <div
            data-testid="all-agents-button"
            onClick={onShowAllAgents}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
          >
            +{agents.length - visibleChatsCount}
          </div>
        )}
      </div>
    </div>
  );
}
