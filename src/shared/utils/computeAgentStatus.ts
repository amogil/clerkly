// Requirements: agents.9.1, agents.9.2, agents.9.4

/**
 * Agent status type - computed dynamically from messages, NOT stored in DB
 */
export type AgentStatus = 'new' | 'in-progress' | 'awaiting-user' | 'error' | 'completed';

/**
 * Message payload structure for status computation
 */
export interface MessagePayload {
  kind: 'user' | 'llm' | 'tool_call' | 'code_exec' | 'final_answer' | 'request_scope' | 'artifact';
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
 * Message structure for status computation
 */
export interface MessageForStatus {
  payloadJson: string;
}

/**
 * Computes agent status from messages.
 * Pure function - deterministic output for same input.
 *
 * Algorithm (agents.9.2):
 * - 'new' - agent has no messages
 * - 'in-progress' - last message is from user (kind = 'user')
 * - 'error' - last message contains result.status = 'error', 'crash', or 'timeout'
 * - 'completed' - last message is 'final_answer'
 * - 'awaiting-user' - last message is from LLM (kind = 'llm') and NOT 'final_answer'
 *
 * @param messages - Array of messages sorted by timestamp (oldest first)
 * @returns Computed agent status
 */
export function computeAgentStatus(messages: MessageForStatus[]): AgentStatus {
  if (messages.length === 0) {
    return 'new';
  }

  const lastMessage = messages[messages.length - 1];

  let payload: MessagePayload;
  try {
    payload = JSON.parse(lastMessage.payloadJson) as MessagePayload;
  } catch {
    // Invalid JSON - treat as new
    return 'new';
  }

  // Check for errors in result.status
  const resultStatus = payload.data?.result?.status;
  if (resultStatus === 'error' || resultStatus === 'crash' || resultStatus === 'timeout') {
    return 'error';
  }

  // Final answer means completed
  if (payload.kind === 'final_answer') {
    return 'completed';
  }

  // Last message from user means in-progress
  if (payload.kind === 'user') {
    return 'in-progress';
  }

  // Last message from LLM (not final_answer) means awaiting-user
  if (payload.kind === 'llm') {
    return 'awaiting-user';
  }

  // Default to new for other kinds (tool_call, code_exec, etc.)
  return 'new';
}
