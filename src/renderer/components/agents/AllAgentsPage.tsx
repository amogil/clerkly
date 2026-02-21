import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';
import { hasError, isNew, getStatusText, getStatusStyles } from '../../../shared/utils/agentStatus';
import { DateTimeFormatter } from '../../../utils/DateTimeFormatter';
import type { AgentSnapshot } from '../../types/agent';

// Requirements: agents.2.1, agents.5.5, realtime-events.9

interface AllAgentsPageProps {
  agents: AgentSnapshot[];
  errorMessages: Map<string, string>;
  onBack: () => void;
  onAgentClick: (agent: AgentSnapshot) => void;
}

const getAgentName = (agent: AgentSnapshot): string => agent.name || 'New Agent';

export function AllAgentsPage({ agents, errorMessages, onBack, onAgentClick }: AllAgentsPageProps) {
  const historyAgents = agents.filter((agent) => !(!agent.name && isNew(agent.status)));

  return (
    <div className="h-[calc(100vh-4rem)] bg-card flex flex-col">
      <div className="h-16 px-6 border-b border-border flex items-center gap-4 flex-shrink-0">
        <button
          onClick={onBack}
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
              onClick={() => onAgentClick(agent)}
              className="p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <AgentAvatar status={agent.status} letter={letter} size="md" />

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
