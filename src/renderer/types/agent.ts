// Requirements: agents.1, agents.7, agents.9

/**
 * Agent status - computed dynamically from messages
 */
export type AgentStatus = 'new' | 'in-progress' | 'awaiting-user' | 'error' | 'completed';

/**
 * Agent entity from database
 */
export interface Agent {
  agentId: string;
  userId: string;
  name: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  archivedAt?: string | null;
}

/**
 * Message payload structure
 * Requirements: agents.7.2
 */
export interface MessagePayload {
  kind: 'user' | 'llm' | 'tool_call' | 'code_exec' | 'final_answer' | 'request_scope' | 'artifact';
  timing?: {
    started_at: string;
    finished_at: string;
  };
  data: {
    text?: string;
    format?: 'markdown' | 'text';
    reply_to_message_id?: number | null;
    result?: {
      status?: string;
      error?: { message?: string };
    };
    [key: string]: unknown;
  };
}

/**
 * Message entity from database
 */
export interface Message {
  id: number;
  agentId: string;
  timestamp: string; // ISO 8601
  payloadJson: string;
}

/**
 * Parsed message with payload
 */
export interface ParsedMessage extends Omit<Message, 'payloadJson'> {
  payload: MessagePayload;
}

/**
 * Parse message payload from JSON string
 */
export function parseMessagePayload(message: Message): ParsedMessage {
  try {
    const payload = JSON.parse(message.payloadJson) as MessagePayload;
    return {
      id: message.id,
      agentId: message.agentId,
      timestamp: message.timestamp,
      payload,
    };
  } catch {
    // Return default payload on parse error
    return {
      id: message.id,
      agentId: message.agentId,
      timestamp: message.timestamp,
      payload: {
        kind: 'user',
        data: { text: '' },
      },
    };
  }
}
