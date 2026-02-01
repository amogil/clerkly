import { Loader2, CheckCircle2, Clock, Mic, AlertCircle, MessageCircle } from 'lucide-react';
import type { AgentTaskStatus } from '@/app/types/agent-task';

interface StatusBadgeProps {
  status: 'listening' | 'processing' | 'completed' | 'scheduled' | 'upcoming' | AgentTaskStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const configs = {
    listening: {
      label: 'Listening',
      icon: Mic,
      className: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    processing: {
      label: 'Processing',
      icon: Loader2,
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      animate: true,
    },
    completed: {
      label: 'Completed',
      icon: CheckCircle2,
      className: 'bg-green-50 text-green-700 border-green-200',
    },
    scheduled: {
      label: 'Scheduled',
      icon: Clock,
      className: 'bg-gray-50 text-gray-700 border-gray-200',
    },
    upcoming: {
      label: 'Upcoming',
      icon: Clock,
      className: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    'waiting-input': {
      label: 'New',
      icon: Clock,
      className: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    'requesting-info': {
      label: 'Needs response',
      icon: MessageCircle,
      className: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    working: {
      label: 'Working',
      icon: Loader2,
      className: 'bg-blue-50 text-blue-700 border-blue-200',
      animate: true,
    },
    error: {
      label: 'Error',
      icon: AlertCircle,
      className: 'bg-red-50 text-red-700 border-red-200',
    },
  };

  const config = configs[status];
  if (!config) {
    // Fallback if status is not recognized
    return null;
  }
  
  const Icon = config.icon;
  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${sizeClasses} rounded-full border font-medium ${config.className}`}
    >
      <Icon className={`${iconSize} ${config.animate ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  );
}