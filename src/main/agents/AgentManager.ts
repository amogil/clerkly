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
} from '../../shared/events/types';
import { EVENT_TYPES } from '../../shared/events/constants';
import { Logger } from '../Logger';
import type { Agent } from '../db/schema';

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
   * Subscribe to MESSAGE_CREATED events to update agent's updatedAt
   * Requirements: agents.1.4, agents.12.2
   */
  private subscribeToEvents(): void {
    MainEventBus.getInstance().subscribe(
      EVENT_TYPES.MESSAGE_CREATED,
      (payload: MessageCreatedPayload) => {
        if (payload.data) {
          this.handleMessageCreated(payload.data.agentId);
        }
      }
    );
  }

  /**
   * Handle MESSAGE_CREATED event - update agent's updatedAt
   * Requirements: agents.1.4, agents.12.2
   */
  private handleMessageCreated(agentId: string): void {
    try {
      // Update agent's updatedAt in database
      this.dbManager.agents.touch(agentId);

      // Get updated agent to publish event with new timestamp
      const updatedAgent = this.dbManager.agents.findById(agentId);
      if (updatedAgent) {
        this.logger.info(`Agent updatedAt updated: ${agentId}`);

        // Publish AGENT_UPDATED event for UI
        MainEventBus.getInstance().publish(
          new AgentUpdatedEvent(agentId, {
            updatedAt: new Date(updatedAgent.updatedAt).getTime(),
          })
        );
      }
    } catch (error) {
      this.logger.error(`Failed to update agent updatedAt for ${agentId}: ${error}`);
    }
  }

  /**
   * Create a new agent for the current user
   * Requirements: agents.2.3, agents.2.4, agents.2.5
   */
  create(name?: string): Agent {
    // Repository automatically generates agentId and injects userId
    const agent = this.dbManager.agents.create(name);

    this.logger.info(`Agent created: ${agent.agentId}`);

    // Publish event for real-time UI updates
    // Requirements: agents.12.1
    MainEventBus.getInstance().publish(
      new AgentCreatedEvent({
        id: agent.agentId,
        name: agent.name || 'New Agent',
        createdAt: Date.parse(agent.createdAt),
        updatedAt: Date.parse(agent.updatedAt),
      })
    );

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

    // Publish event for real-time UI updates
    // Requirements: agents.12.2
    MainEventBus.getInstance().publish(new AgentUpdatedEvent(agentId, data));
  }

  /**
   * Archive an agent (soft delete)
   * Requirements: agents.10.4
   */
  archive(agentId: string): void {
    // Repository automatically checks ownership
    this.dbManager.agents.archive(agentId);

    this.logger.info(`Agent archived: ${agentId}`);

    // Publish event for real-time UI updates
    // Requirements: agents.12.3
    MainEventBus.getInstance().publish(new AgentArchivedEvent(agentId));
  }
}
