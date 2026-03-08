// Requirements: agents.6, agents.9
// Utility functions for working with agent status

export type AgentStatus = 'new' | 'in-progress' | 'awaiting-response' | 'error' | 'completed';

export const AGENT_STATUS = {
  NEW: 'new',
  IN_PROGRESS: 'in-progress',
  AWAITING_RESPONSE: 'awaiting-response',
  ERROR: 'error',
  COMPLETED: 'completed',
} as const;

export const MESSAGE_KIND = {
  USER: 'user',
  LLM: 'llm',
  ERROR: 'error',
  TOOL_CALL: 'tool_call',
} as const;

/**
 * Message payload structure for status computation
 * Note: 'kind' is stored as a separate DB column, not in payload
 */
export interface MessagePayload {
  timing?: { started_at: string; finished_at: string };
  data?: {
    result?: {
      status?: string;
      error?: { message?: string };
    };
    [key: string]: unknown;
  };
}

/**
 * Check if agent is in progress
 */
export function isInProgress(status: AgentStatus): boolean {
  return status === 'in-progress';
}

/**
 * Check if agent is awaiting user response
 */
export function isAwaitingUser(status: AgentStatus): boolean {
  return status === 'awaiting-response';
}

/**
 * Check if agent has error
 */
export function hasError(status: AgentStatus): boolean {
  return status === 'error';
}

/**
 * Check if agent completed work
 */
export function isCompleted(status: AgentStatus): boolean {
  return status === 'completed';
}

/**
 * Check if agent is new (no messages)
 */
export function isNew(status: AgentStatus): boolean {
  return status === 'new';
}

/**
 * Get human-readable status text
 */
export function getStatusText(status: AgentStatus): string {
  switch (status) {
    case 'new':
      return 'New';
    case 'in-progress':
      return 'In progress';
    case 'awaiting-response':
      return 'Awaiting response';
    case 'error':
      return 'Error';
    case 'completed':
      return 'Completed';
  }
}

/**
 * Get status styles (colors, rings, etc.)
 */
export function getStatusStyles(status: AgentStatus): {
  bg: string;
  ring: string;
  text: string;
} {
  switch (status) {
    case 'new':
      return { bg: 'bg-sky-400', ring: 'ring-sky-400/30', text: 'text-sky-600' };
    case 'in-progress':
      return { bg: 'bg-blue-500', ring: 'ring-blue-500/30', text: 'text-blue-600' };
    case 'awaiting-response':
      return { bg: 'bg-amber-500', ring: 'ring-amber-500/30', text: 'text-amber-600' };
    case 'error':
      return { bg: 'bg-red-500', ring: 'ring-red-500/30', text: 'text-red-600' };
    case 'completed':
      return { bg: 'bg-green-500', ring: 'ring-green-500/30', text: 'text-green-600' };
  }
}
