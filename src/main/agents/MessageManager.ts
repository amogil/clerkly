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
      kind: message.kind,
      timestamp: new Date(message.timestamp).getTime(),
      payload,
      hidden: message.hidden ?? false,
    };
  }

  /**
   * List messages for an agent with pagination (last N, optionally before a given id)
   * Requirements: agents.13.1, agents.13.2, agents.13.4
   */
  listPaginated(
    agentId: string,
    limit: number,
    beforeId?: number
  ): { messages: Message[]; hasMore: boolean } {
    return this.dbManager.messages.listByAgentPaginated(agentId, limit, beforeId);
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
   * Dismiss all kind:error messages for an agent (set hidden = true)
   * Called before creating a new kind:user message.
   * Repository returns only the records that were actually changed (were visible before).
   * Requirements: llm-integration.3.8
   */
  dismissErrorMessages(agentId: string): void {
    // Repository filters hidden=false and returns only newly-dismissed records via RETURNING
    const dismissed = this.dbManager.messages.dismissErrorMessages(agentId);
    this.logger.info(`Error messages dismissed for agent ${agentId}`);

    // Emit message.updated for each newly hidden error message so renderer hides them
    // Requirements: llm-integration.3.8
    for (const msg of dismissed) {
      MainEventBus.getInstance().publish(new MessageUpdatedEvent(this.toEventMessage(msg)));
    }
  }

  /**
   * Hide a specific message (set hidden = true)
   * Used for interrupted llm messages
   * Requirements: llm-integration.8.5
   */
  setHidden(messageId: number, agentId: string): void {
    this.dbManager.messages.setHidden(messageId, agentId);
    this.logger.info(`Message hidden: ${messageId}`);

    // Fetch updated message to emit event
    const updated = this.dbManager.messages.getById(messageId, agentId);
    if (updated) {
      MainEventBus.getInstance().publish(new MessageUpdatedEvent(this.toEventMessage(updated)));
    }
  }

  /**
   * Create a new message for an agent
   * Requirements: agents.4.3, agents.7.1, agents.12.4, llm-integration.2
   * @param kind Message kind: 'user' | 'llm' | 'error' | etc.
   * @param timestamp Optional timestamp (ISO string). If not provided, uses current time.
   */
  create(agentId: string, kind: string, payload: MessagePayload, timestamp?: string): Message {
    // Repository automatically checks access
    const payloadJson = JSON.stringify(payload);
    const message = this.dbManager.messages.create(agentId, kind, payloadJson, timestamp);

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

    // Fetch updated message to get correct kind for the event
    const updated = this.dbManager.messages.getById(messageId, agentId);
    if (updated) {
      MainEventBus.getInstance().publish(new MessageUpdatedEvent(this.toEventMessage(updated)));
    }
  }
}
