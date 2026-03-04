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
import type { LLMUsage } from '../llm/ILLMProvider';

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
      replyToMessageId: message.replyToMessageId ?? null,
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
   * List messages for LLM history (excludes hidden and kind:error).
   * Requirements: llm-integration.3.9, llm-integration.8.6
   */
  listForModelHistory(agentId: string): Message[] {
    const messages = this.dbManager.messages.listByAgent(agentId, true);
    return messages.filter((msg) => !msg.hidden && msg.kind !== 'error');
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
   * Get the last user message for an agent (most recent)
   * Returns null if no user messages exist
   * Requirements: llm-integration.3.4.3, llm-integration.3.7.3
   */
  getLastUserMessage(agentId: string): Message | null {
    // Repository automatically checks access through AgentsRepository
    return this.dbManager.messages.getLastUserByAgent(agentId);
  }

  /**
   * Hide all visible kind:error messages for an agent (set hidden = true)
   * Called before creating a new kind:user message.
   * Repository returns only the records that were actually changed.
   * Requirements: llm-integration.3.8
   */
  hideErrorMessages(agentId: string): void {
    const hiddenMessages = this.dbManager.messages.hideErrorMessages(agentId);
    this.logger.info(`Error messages hidden for agent ${agentId}`);

    // Emit message.updated for each newly hidden error message so renderer hides them
    // Requirements: llm-integration.3.8
    for (const msg of hiddenMessages) {
      MainEventBus.getInstance().publish(new MessageUpdatedEvent(this.toEventMessage(msg)));
    }
  }

  /**
   * Hide a specific message (set hidden = true)
   * Used for cancelled llm messages
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
  create(
    agentId: string,
    kind: string,
    payload: MessagePayload,
    replyToMessageId: number | null,
    timestamp?: string,
    emitEvent: boolean = true
  ): Message {
    // Repository automatically checks access
    const payloadJson = JSON.stringify(payload);
    const message = this.dbManager.messages.create(
      agentId,
      kind,
      payloadJson,
      replyToMessageId,
      timestamp
    );

    this.logger.info(`Message created: ${message.id} for agent ${agentId}`);

    if (emitEvent) {
      // Publish message created event for real-time UI updates
      // Requirements: agents.12.4
      MainEventBus.getInstance().publish(new MessageCreatedEvent(this.toEventMessage(message)));
    }

    return message;
  }

  /**
   * Update a message's payload
   * Requirements: agents.7.1
   */
  update(
    messageId: number,
    agentId: string,
    payload: MessagePayload,
    emitEvent: boolean = true
  ): void {
    // Repository automatically checks access
    const payloadJson = JSON.stringify(payload);
    this.dbManager.messages.update(messageId, agentId, payloadJson);

    this.logger.info(`Message updated: ${messageId}`);

    if (emitEvent) {
      // Fetch updated message to get correct kind for the event
      const updated = this.dbManager.messages.getById(messageId, agentId);
      if (updated) {
        MainEventBus.getInstance().publish(new MessageUpdatedEvent(this.toEventMessage(updated)));
      }
    }
  }

  /**
   * Persist normalized+raw usage envelope in messages.usage_json.
   * Requirements: llm-integration.13
   */
  setUsage(messageId: number, agentId: string, usage: LLMUsage): void {
    this.dbManager.messages.updateUsageJson(messageId, agentId, JSON.stringify(usage));
    this.logger.info(`Message usage saved: ${messageId}`);
  }
}
