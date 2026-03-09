// Requirements: agents.2, agents.10, user-data-isolation.6.5, user-data-isolation.6.3, llm-integration.6
// src/main/agents/AgentManager.ts
// Business logic for agents management

import { IDatabaseManager } from '../DatabaseManager';
import { MainEventBus } from '../events/MainEventBus';
import {
  AgentCreatedEvent,
  AgentUpdatedEvent,
  AgentArchivedEvent,
  MessageCreatedPayload,
  MessageUpdatedPayload,
  AgentSnapshot,
} from '../../shared/events/types';
import { EVENT_TYPES } from '../../shared/events/constants';
import { Logger } from '../Logger';
import { handleBackgroundError } from '../ErrorHandler';
import type { Agent } from '../db/schema';
import type { Message } from '../db/schema';
import type { AgentStatus } from '../../shared/utils/agentStatus';
import { AGENT_STATUS, MESSAGE_KIND } from '../../shared/utils/agentStatus';

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
  // Active AbortControllers per agent — for cancelling running pipelines
  // Requirements: llm-integration.6
  private pipelineControllers = new Map<string, AbortController>();

  constructor(dbManager: IDatabaseManager) {
    this.dbManager = dbManager;
    this.subscribeToEvents();
  }

  /**
   * Compute agent status from the latest visible message.
   * Requirements: agents.9.2, agents.9.4
   */
  private computeAgentStatus(lastMessage: Message | null): AgentStatus {
    if (!lastMessage) {
      return AGENT_STATUS.NEW;
    }

    if (lastMessage.kind === MESSAGE_KIND.ERROR) {
      return AGENT_STATUS.ERROR;
    }

    if (lastMessage.kind === MESSAGE_KIND.USER) {
      return AGENT_STATUS.IN_PROGRESS;
    }

    if (lastMessage.kind === MESSAGE_KIND.LLM) {
      return lastMessage.done ? AGENT_STATUS.AWAITING_RESPONSE : AGENT_STATUS.IN_PROGRESS;
    }

    if (lastMessage.kind === MESSAGE_KIND.TOOL_CALL) {
      if (!lastMessage.done) {
        return AGENT_STATUS.IN_PROGRESS;
      }
      return this.extractToolName(lastMessage) === 'final_answer'
        ? AGENT_STATUS.COMPLETED
        : AGENT_STATUS.AWAITING_RESPONSE;
    }

    return AGENT_STATUS.NEW;
  }

  /**
   * Extract tool name from persisted tool_call payload.
   * Requirements: agents.9.2, llm-integration.9.4
   */
  private extractToolName(message: Message): string | null {
    try {
      const payload = JSON.parse(message.payloadJson) as {
        data?: { toolName?: unknown };
      };
      return typeof payload?.data?.toolName === 'string' ? payload.data.toolName : null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve latest visible message with fast path for normal streaming updates.
   * Requirements: agents.9.2, realtime-events.6.1
   */
  private getLatestVisibleMessage(agentId: string): Message | null {
    const lastMessage = this.dbManager.messages.getLastByAgent(agentId);
    if (!lastMessage) {
      return null;
    }
    if (!lastMessage.hidden) {
      return lastMessage;
    }

    // Fallback for tail-hidden threads (e.g. after cancellation) to preserve status correctness.
    const visible = this.dbManager.messages.listByAgent(agentId, false);
    return visible[visible.length - 1] ?? null;
  }

  /**
   * Convert DB Agent entity to Event Agent model with computed status
   * Requirements: realtime-events.9.5
   */
  public toEventAgent(agent: Agent): AgentSnapshot {
    const lastVisible = this.getLatestVisibleMessage(agent.agentId);
    let status = this.computeAgentStatus(lastVisible);
    if (lastVisible?.kind === MESSAGE_KIND.USER && !this.pipelineControllers.has(agent.agentId)) {
      status = AGENT_STATUS.AWAITING_RESPONSE;
    }

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

    MainEventBus.getInstance().subscribe(
      EVENT_TYPES.MESSAGE_UPDATED,
      (payload: MessageUpdatedPayload) => {
        if (payload.message) {
          this.handleMessageUpdated(payload.message.agentId);
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

      // Update agent's updatedAt using repository method
      // Note: This bypasses user check since we're updating by agentId directly
      // The MESSAGE_CREATED event is only published for valid agents, so this is safe
      this.dbManager.agents.update(agentId, { updatedAt: messageTimestampISO });

      // Get updated agent to publish event with new timestamp and status
      const updatedAgent = this.dbManager.agents.findById(agentId);
      if (updatedAgent) {
        this.logger.info(`Agent updatedAt updated to message timestamp: ${agentId}`);

        // Publish AGENT_UPDATED event for UI with full agent model including status
        MainEventBus.getInstance().publish(
          new AgentUpdatedEvent(this.toEventAgent(updatedAgent), ['updatedAt', 'status'])
        );
      }
    } catch (error) {
      // Use ErrorHandler to show error notification to user
      // Requirements: error-notifications.1
      handleBackgroundError(error, 'Agent Update');
      throw error; // Re-throw for logging in MainEventBus
    }
  }

  /**
   * Handle MESSAGE_UPDATED event - recalculate status and publish AGENT_UPDATED.
   * Does not mutate updatedAt, because message update may only change payload (e.g. reasoning -> action).
   * Requirements: agents.9.2, agents.9.3, agents.12.2
   */
  private handleMessageUpdated(agentId: string): void {
    try {
      const updatedAgent = this.dbManager.agents.findById(agentId);
      if (updatedAgent) {
        MainEventBus.getInstance().publish(
          new AgentUpdatedEvent(this.toEventAgent(updatedAgent), ['status'])
        );
      }
    } catch (error) {
      handleBackgroundError(error, 'Agent Status Update');
      throw error;
    }
  }

  /**
   * Publish AGENT_UPDATED with recomputed status for a specific agent.
   * Used when status changes without MESSAGE_UPDATED side effects (e.g., pipeline cancel before first llm chunk).
   * Requirements: agents.9.2, agents.12.2, llm-integration.8.1
   */
  publishStatusUpdated(agentId: string): void {
    try {
      const updatedAgent = this.dbManager.agents.findById(agentId);
      if (updatedAgent) {
        MainEventBus.getInstance().publish(
          new AgentUpdatedEvent(this.toEventAgent(updatedAgent), ['status'])
        );
      }
    } catch (error) {
      handleBackgroundError(error, 'Agent Status Update');
      throw error;
    }
  }

  /**
   * Store an AbortController for a running pipeline
   * Requirements: llm-integration.6
   */
  setPipelineController(agentId: string, controller: AbortController): void {
    this.pipelineControllers.set(agentId, controller);
  }

  /**
   * Cancel the running pipeline for an agent (if any)
   * Requirements: llm-integration.6
   */
  cancelPipeline(agentId: string): boolean {
    const controller = this.pipelineControllers.get(agentId);
    if (controller) {
      controller.abort();
      this.pipelineControllers.delete(agentId);
      this.logger.info(`Pipeline cancelled for agent ${agentId}`);
      return true;
    }
    return false;
  }

  /**
   * Clear pipeline controller only if it matches the given controller instance.
   * Prevents a finished pipeline from removing a newer pipeline's controller.
   * Requirements: llm-integration.6
   */
  clearPipelineController(agentId: string, controller: AbortController): void {
    if (this.pipelineControllers.get(agentId) === controller) {
      this.pipelineControllers.delete(agentId);
      this.logger.info(`Pipeline controller cleared for agent ${agentId}`);
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
      MainEventBus.getInstance().publish(
        new AgentUpdatedEvent(this.toEventAgent(updatedAgent), ['name', 'updatedAt'])
      );
    }
  }

  /**
   * Archive an agent (soft delete)
   * Requirements: agents.10.4, llm-integration.6
   */
  archive(agentId: string): void {
    // Get agent before archiving to create snapshot
    const agent = this.dbManager.agents.findById(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Cancel any running pipeline for this agent before archiving
    // Requirements: llm-integration.6
    this.cancelPipeline(agentId);

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
