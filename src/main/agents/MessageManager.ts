// Requirements: agents.4, agents.7, user-data-isolation.6.5, user-data-isolation.7.6
// src/main/agents/MessageManager.ts
// Business logic for messages management

import { IDatabaseManager } from '../DatabaseManager';
import { MainEventBus } from '../events/MainEventBus';
import { MessageCreatedEvent, MessageUpdatedEvent } from '../../shared/events/types';
import { Logger } from '../Logger';
import type { Message } from '../db/schema';

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
  data: Record<string, unknown>;
}

/**
 * MessageManager - business logic for messages
 *
 * Uses DatabaseManager repositories for data operations.
 * Access control is handled by MessagesRepository through AgentsRepository.
 * Generates events through MainEventBus for real-time UI updates.
 *
 * Requirements: agents.4, agents.7
 */
export class MessageManager {
  private dbManager: IDatabaseManager;
  private logger = Logger.create('MessageManager');

  constructor(dbManager: IDatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * List all messages for an agent
   * Requirements: agents.4.8, user-data-isolation.7.6
   */
  list(agentId: string): Message[] {
    // Repository automatically checks access through AgentsRepository
    return this.dbManager.messages.listByAgent(agentId);
  }

  /**
   * Get the last message for an agent (most recent)
   * Returns null if no messages exist
   * Requirements: agents.5.5
   */
  getLastMessage(agentId: string): Message | null {
    // Repository automatically checks access through AgentsRepository
    return this.dbManager.messages.getLastByAgent(agentId);
  }

  /**
   * Create a new message for an agent
   * Requirements: agents.4.3, agents.7.1, agents.1.4
   */
  create(agentId: string, payload: MessagePayload): Message {
    // Repository automatically checks access and updates agent.updatedAt
    const payloadJson = JSON.stringify(payload);
    const message = this.dbManager.messages.create(agentId, payloadJson);

    this.logger.info(`Message created: ${message.id} for agent ${agentId}`);

    // Publish event for real-time UI updates
    // Requirements: agents.12.4
    MainEventBus.getInstance().publish(
      new MessageCreatedEvent({
        id: message.id,
        agentId: message.agentId,
        timestamp: message.timestamp,
        payloadJson: message.payloadJson,
      })
    );

    return message;
  }

  /**
   * Update a message's payload
   * Requirements: agents.7.1
   */
  update(messageId: number, agentId: string, payload: MessagePayload): void {
    // Repository automatically checks access
    const payloadJson = JSON.stringify(payload);
    this.dbManager.messages.update(messageId, agentId, payloadJson);

    this.logger.info(`Message updated: ${messageId}`);

    // Publish event for real-time UI updates
    // Requirements: agents.12.5
    MainEventBus.getInstance().publish(
      new MessageUpdatedEvent(messageId, {
        payloadJson,
      })
    );
  }
}
