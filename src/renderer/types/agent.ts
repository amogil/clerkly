// Requirements: agents.1, agents.7, agents.9

import type { AgentStatus, MessagePayload } from '../../shared/utils/agentStatus';

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
