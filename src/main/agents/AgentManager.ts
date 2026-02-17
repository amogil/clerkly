// Requirements: agents.2, agents.10, user-data-isolation.6.5, user-data-isolation.6.3
// src/main/agents/AgentManager.ts
// Business logic for agents management

import { IDatabaseManager } from '../DatabaseManager';
import { MainEventBus } from '../events/MainEventBus';
import {
  AgentCreatedEvent,
  AgentUpdatedEvent,
  AgentArchivedEvent,
  MessageCreatedPayload,
  AgentSnapshot,
} from '../../shared/events/types';
import { EVENT_TYPES } from '../../shared/events/constants';
import { Logger } from '../Logger';
import { handleBackgroundError } from '../ErrorHandler';
import type { Agent } from '../db/schema';
import type { Message } from '../db/schema';
import type { AgentStatus, MessagePayload } from '../../shared/utils/agentStatus';

/**
 * AgentManager - business logic for agents
 *
 * Uses DatabaseManager repositories for data operations with automatic userId isolation.
 * Generates events through MainEventBus for real-time UI updates.
 *
 * Requirements: agents.2, agents.10
 */
export class AgentManager {
  private dbManager: IDatabaseManager;
  private logger = Logger.create('AgentManager');

  constructor(dbManager: IDatabaseManager) {
    this.dbManager = dbManager;
    this.subscribeToEvents();
  }

  /**
   * Compute agent status based on the last message
   * Requirements: agents.5.1, agents.5.2, agents.5.3, agents.5.4, agents.5.5
   */
  private computeAgentStatus(message: Message | null): AgentStatus {
    if (!message) {
      return 'new';
    }

    try {
      const payload: MessagePayload = JSON.parse(message.payloadJson);

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

      // Last message from LLM (not final_answer) means awaiting-response
      if (payload.kind === 'llm') {
        return 'awaiting-response';
      }

      // Default to new for other kinds (tool_call, code_exec, etc.)
      return 'new';
    } catch (error) {
      this.logger.error(`Failed to parse message payload: ${error}`);
      return 'new';
    }
  }

  /**
   * Convert DB Agent entity to Event Agent model with computed status
   * Requirements: realtime-events.9.5
   */
  public toEventAgent(agent: Agent): AgentSnapshot {
    // Get last message to compute status
    const lastMessage = this.dbManager.messages.getLastByAgent(agent.agentId);
    const status = this.computeAgentStatus(lastMessage);

    return {
      id: agent.agentId,
      name: agent.name,
      createdAt: new Date(agent.createdAt).getTime(),
      updatedAt: new Date(agent.updatedAt).getTime(),
      archivedAt: agent.archivedAt ? new Date(agent.archivedAt).getTime() : null,
      status,
    };
  }

  /**
   * Subscribe to MESSAGE_CREATED events to update agent's updatedAt
   * Requirements: agents.1.4, agents.12.2
   */
  private subscribeToEvents(): void {
    MainEventBus.getInstance().subscribe(
      EVENT_TYPES.MESSAGE_CREATED,
      (payload: MessageCreatedPayload) => {
        if (payload.message) {
          this.handleMessageCreated(payload.message.agentId, payload.message.timestamp);
        }
      }
    );
  }

  /**
   * Handle MESSAGE_CREATED event - update agent's updatedAt to message timestamp
   * Requirements: agents.1.4, agents.12.2, error-notifications.1
   */
  private handleMessageCreated(agentId: string, messageTimestamp: number): void {
    try {
      // Update agent's updatedAt to the message timestamp (not current time)
      // This ensures agent's updatedAt reflects the time of the last message
      const messageTimestampISO = new Date(messageTimestamp).toISOString();
      this.dbManager.agents.setUpdatedAt(agentId, messageTimestampISO);

      // Get updated agent to publish event with new timestamp and status
      const updatedAgent = this.dbManager.agents.findById(agentId);
      if (updatedAgent) {
        this.logger.info(`Agent updatedAt updated to message timestamp: ${agentId}`);

        // Publish AGENT_UPDATED event for UI with full agent model including status
        MainEventBus.getInstance().publish(new AgentUpdatedEvent(this.toEventAgent(updatedAgent)));
      }
    } catch (error) {
      // Use ErrorHandler to show error notification to user
      // Requirements: error-notifications.1
      handleBackgroundError(error, 'Agent Update');
      throw error; // Re-throw for logging in MainEventBus
    }
  }

  /**
   * Create a new agent for the current user
   * Requirements: agents.2.3, agents.2.4, agents.2.5
   */
  create(name?: string): Agent {
    // Use default name if not provided
    const agentName = name || 'New Agent';

    // Repository automatically generates agentId and injects userId
    const agent = this.dbManager.agents.create(agentName);

    this.logger.info(`Agent created: ${agent.agentId}`);

    // Publish event for real-time UI updates with full agent model
    // Requirements: agents.12.1
    MainEventBus.getInstance().publish(new AgentCreatedEvent(this.toEventAgent(agent)));

    return agent;
  }

  /**
   * List all non-archived agents for the current user
   * Requirements: agents.1.3, agents.10.2
   */
  list(): Agent[] {
    // Repository automatically filters by userId and excludes archived
    return this.dbManager.agents.list();
  }

  /**
   * Get a specific agent by ID
   * Requirements: agents.3.2, agents.10.4
   */
  get(agentId: string): Agent | undefined {
    // Repository automatically checks ownership
    return this.dbManager.agents.findById(agentId);
  }

  /**
   * Update an agent's name
   * Requirements: agents.10.4
   */
  update(agentId: string, data: { name?: string }): void {
    // Repository automatically checks ownership and updates updatedAt
    this.dbManager.agents.update(agentId, data);

    this.logger.info(`Agent updated: ${agentId}`);

    // Get updated agent and publish event with full model
    // Requirements: agents.12.2
    const updatedAgent = this.dbManager.agents.findById(agentId);
    if (updatedAgent) {
      MainEventBus.getInstance().publish(new AgentUpdatedEvent(this.toEventAgent(updatedAgent)));
    }
  }

  /**
   * Archive an agent (soft delete)
   * Requirements: agents.10.4
   */
  archive(agentId: string): void {
    // Get agent before archiving to create snapshot
    const agent = this.dbManager.agents.findById(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Repository automatically checks ownership
    this.dbManager.agents.archive(agentId);

    this.logger.info(`Agent archived: ${agentId}`);

    // Get archived agent to create snapshot with archivedAt timestamp
    const archivedAgent = this.dbManager.agents.findById(agentId);
    if (archivedAgent) {
      // Publish event for real-time UI updates with full agent snapshot
      // Requirements: agents.12.3
      MainEventBus.getInstance().publish(new AgentArchivedEvent(this.toEventAgent(archivedAgent)));
    }
  }
}
