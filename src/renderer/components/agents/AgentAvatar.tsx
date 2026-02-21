import React from 'react';
import { Check, X, HelpCircle } from 'lucide-react';
import {
  isInProgress,
  isAwaitingUser,
  hasError,
  isCompleted,
  getStatusStyles,
  type AgentStatus,
} from '../../../shared/utils/agentStatus';

// Requirements: agents.2.1, agents.5.1, agents.5.2, agents.5.3, agents.5.4

interface AgentAvatarProps {
  status: AgentStatus;
  letter: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function AgentAvatar({ status, letter, size = 'md', className = '' }: AgentAvatarProps) {
  const { bg, ring } = getStatusStyles(status);
  const dim = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const badgeDim = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const badgeIcon = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';

  return (
    <div
      className={`relative flex-shrink-0 ${dim} rounded-full ${bg} flex items-center justify-center ${className}`}
    >
      {isCompleted(status) ? (
        <Check className={`${iconSize} text-white`} />
      ) : hasError(status) ? (
        <X className={`${iconSize} text-white`} />
      ) : isAwaitingUser(status) ? (
        <>
          <span className={`text-white ${textSize} font-semibold`}>{letter}</span>
          <div
            className={`absolute -bottom-0.5 -right-0.5 ${badgeDim} rounded-full ${bg} border-2 border-card flex items-center justify-center`}
          >
            <HelpCircle className={`${badgeIcon} text-white`} />
          </div>
        </>
      ) : (
        <span className={`text-white ${textSize} font-semibold`}>{letter}</span>
      )}

      {isInProgress(status) && (
        <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
      )}

      {isAwaitingUser(status) && (
        <div className={`absolute -inset-1 rounded-full ring-2 ${ring} animate-pulse`} />
      )}
    </div>
  );
}
