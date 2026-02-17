// Requirements: agents.4, agents.7, user-data-isolation.6.5, user-data-isolation.7.6
// src/main/agents/MessageManager.ts
// Business logic for messages management

import { IDatabaseManager } from '../DatabaseManager';
import { MainEventBus } from '../events/MainEventBus';
import {
  MessageCreatedEvent,
  MessageUpdatedEvent,
  MessageSnapshot,
} from '../../shared/events/types';
import { Logger } from '../Logger';
import type { Message } from '../db/schema';
import type { MessagePayload } from '../../shared/utils/agentStatus';

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
   * Convert DB Message entity to Event MessageSnapshot
   * @throws Error if payload JSON is invalid
   */
  public toEventMessage(message: Message): MessageSnapshot {
    let payload: MessagePayload;
    try {
      payload = JSON.parse(message.payloadJson) as MessagePayload;
    } catch (error) {
      const errorMsg = `Failed to parse message payload for message ${message.id}: ${error}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    return {
      id: message.id,
      agentId: message.agentId,
      timestamp: new Date(message.timestamp).getTime(),
      payload,
    };
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
   * Requirements: agents.4.3, agents.7.1, agents.12.4
   * @param timestamp Optional timestamp (ISO string). If not provided, uses current time.
   */
  create(agentId: string, payload: MessagePayload, timestamp?: string): Message {
    // Repository automatically checks access
    const payloadJson = JSON.stringify(payload);
    const message = this.dbManager.messages.create(agentId, payloadJson, timestamp);

    this.logger.info(`Message created: ${message.id} for agent ${agentId}`);

    // Publish message created event for real-time UI updates
    // Requirements: agents.12.4
    MainEventBus.getInstance().publish(new MessageCreatedEvent(this.toEventMessage(message)));

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

    // Create snapshot using toEventMessage helper
    // Note: We create a temporary Message object since we don't fetch from DB
    const tempMessage: Message = {
      id: messageId,
      agentId,
      timestamp: new Date().toISOString(),
      payloadJson,
    };

    // Publish event for real-time UI updates
    // Requirements: agents.12.5
    MainEventBus.getInstance().publish(new MessageUpdatedEvent(this.toEventMessage(tempMessage)));
  }
}
