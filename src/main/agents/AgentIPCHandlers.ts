// Requirements: agents.2, agents.4, agents.10, user-data-isolation.6.8, llm-integration.6
// src/main/agents/AgentIPCHandlers.ts
// IPC handlers for agents and messages

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { AgentManager } from './AgentManager';
import { MessageManager } from './MessageManager';
import { MainPipeline } from './MainPipeline';
import { Logger } from '../Logger';
import { handleBackgroundError } from '../ErrorHandler';
import type { MessagePayload } from '../../shared/utils/agentStatus';

/**
 * IPC result interface for agents operations
 */
interface IPCResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * AgentIPCHandlers - thin IPC layer for agents and messages
 *
 * userId is NOT passed through IPC - it's automatically injected
 * by DatabaseManager repositories.
 *
 * Requirements: agents.2, agents.4, agents.10, user-data-isolation.6.8
 */
export class AgentIPCHandlers {
  private agentManager: AgentManager;
  private messageManager: MessageManager;
  private pipeline: MainPipeline;
  private logger = Logger.create('AgentIPCHandlers');
  private handlersRegistered = false;

  constructor(agentManager: AgentManager, messageManager: MessageManager, pipeline: MainPipeline) {
    this.agentManager = agentManager;
    this.messageManager = messageManager;
    this.pipeline = pipeline;
  }

  /**
   * Register all IPC handlers for agents and messages
   * Requirements: agents.2, agents.4
   */
  registerHandlers(): void {
    if (this.handlersRegistered) {
      this.logger.warn('Handlers already registered');
      return;
    }

    // Agent handlers
    ipcMain.handle('agents:create', this.handleAgentCreate.bind(this));
    ipcMain.handle('agents:list', this.handleAgentList.bind(this));
    ipcMain.handle('agents:get', this.handleAgentGet.bind(this));
    ipcMain.handle('agents:update', this.handleAgentUpdate.bind(this));
    ipcMain.handle('agents:archive', this.handleAgentArchive.bind(this));

    // Message handlers
    ipcMain.handle('messages:list', this.handleMessageList.bind(this));
    ipcMain.handle('messages:list-paginated', this.handleMessageListPaginated.bind(this));
    ipcMain.handle('messages:get-last', this.handleMessageGetLast.bind(this));
    ipcMain.handle('messages:create', this.handleMessageCreate.bind(this));
    ipcMain.handle('messages:update', this.handleMessageUpdate.bind(this));
    ipcMain.handle('messages:cancel', this.handleMessageCancel.bind(this));
    ipcMain.handle('messages:retry-last', this.handleMessageRetryLast.bind(this));
    ipcMain.handle('messages:cancel-retry', this.handleMessageCancelRetry.bind(this));

    this.handlersRegistered = true;
    this.logger.info('Handlers registered');
  }

  /**
   * Unregister all IPC handlers
   */
  unregisterHandlers(): void {
    if (!this.handlersRegistered) {
      return;
    }

    ipcMain.removeHandler('agents:create');
    ipcMain.removeHandler('agents:list');
    ipcMain.removeHandler('agents:get');
    ipcMain.removeHandler('agents:update');
    ipcMain.removeHandler('agents:archive');
    ipcMain.removeHandler('messages:list');
    ipcMain.removeHandler('messages:list-paginated');
    ipcMain.removeHandler('messages:get-last');
    ipcMain.removeHandler('messages:create');
    ipcMain.removeHandler('messages:update');
    ipcMain.removeHandler('messages:cancel');
    ipcMain.removeHandler('messages:retry-last');
    ipcMain.removeHandler('messages:cancel-retry');

    this.handlersRegistered = false;
    this.logger.info('Handlers unregistered');
  }

  /**
   * Handle agents:create request
   * Requirements: agents.2.3, agents.2.4, agents.2.5, realtime-events.9.8
   */
  private async handleAgentCreate(
    _event: IpcMainInvokeEvent,
    args: { name?: string }
  ): Promise<IPCResult> {
    try {
      const agent = this.agentManager.create(args?.name);
      this.logger.info(`Agent created: ${agent.agentId}`);
      // Convert to snapshot with computed status
      const snapshot = this.agentManager.toEventAgent(agent);
      return { success: true, data: snapshot };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create agent: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle agents:list request
   * Requirements: agents.1.3, agents.10.2, realtime-events.9.8
   */
  private async handleAgentList(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      const dbAgents = this.agentManager.list();
      // Convert to snapshots with computed status
      const snapshots = dbAgents.map((agent) => this.agentManager.toEventAgent(agent));
      return { success: true, data: snapshots };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list agents: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle agents:get request
   * Requirements: agents.3.2, agents.10.4, realtime-events.9.8
   */
  private async handleAgentGet(
    _event: IpcMainInvokeEvent,
    args: { agentId: string }
  ): Promise<IPCResult> {
    try {
      const agent = this.agentManager.get(args.agentId);
      if (!agent) {
        return { success: false, error: 'Agent not found' };
      }
      // Convert to snapshot with computed status
      const snapshot = this.agentManager.toEventAgent(agent);
      return { success: true, data: snapshot };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get agent: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle agents:update request
   * Requirements: agents.10.4
   */
  private async handleAgentUpdate(
    _event: IpcMainInvokeEvent,
    args: { agentId: string; name?: string }
  ): Promise<IPCResult> {
    try {
      const { agentId, ...data } = args;
      this.agentManager.update(agentId, data);
      this.logger.info(`Agent updated: ${agentId}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to update agent: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle agents:archive request
   * Requirements: agents.10.4
   */
  private async handleAgentArchive(
    _event: IpcMainInvokeEvent,
    args: { agentId: string }
  ): Promise<IPCResult> {
    try {
      this.agentManager.archive(args.agentId);
      this.logger.info(`Agent archived: ${args.agentId}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to archive agent: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle messages:list request
   * Requirements: agents.4.8, user-data-isolation.7.6, realtime-events.9.8
   */
  private async handleMessageList(
    _event: IpcMainInvokeEvent,
    args: { agentId: string }
  ): Promise<IPCResult> {
    try {
      const dbMessages = this.messageManager.list(args.agentId);
      // Convert to snapshots with parsed payloads
      const snapshots = dbMessages.map((msg) => this.messageManager.toEventMessage(msg));
      return { success: true, data: snapshots };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list messages: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  // Requirements: agents.13.1, agents.13.2, agents.13.4
  private async handleMessageListPaginated(
    _event: IpcMainInvokeEvent,
    args: { agentId: string; limit?: number; beforeId?: number }
  ): Promise<IPCResult> {
    try {
      const limit = args.limit ?? 50;
      const { messages: dbMessages, hasMore } = this.messageManager.listPaginated(
        args.agentId,
        limit,
        args.beforeId
      );
      const snapshots = dbMessages.map((msg) => this.messageManager.toEventMessage(msg));
      return { success: true, data: { messages: snapshots, hasMore } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list paginated messages: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle messages:get-last request
   * Returns the last message for an agent (most recent)
   * Requirements: agents.5.5, realtime-events.9.8
   */
  private async handleMessageGetLast(
    _event: IpcMainInvokeEvent,
    args: { agentId: string }
  ): Promise<IPCResult> {
    try {
      const message = this.messageManager.getLastMessage(args.agentId);
      if (!message) {
        return { success: true, data: null };
      }
      // Convert to snapshot with parsed payload
      const snapshot = this.messageManager.toEventMessage(message);
      return { success: true, data: snapshot };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get last message: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle messages:create request
   * Requirements: agents.4.3, agents.7.1, agents.1.4, realtime-events.9.8, llm-integration.2, llm-integration.6
   */
  private async handleMessageCreate(
    _event: IpcMainInvokeEvent,
    args: { agentId: string; kind: string; payload: MessagePayload }
  ): Promise<IPCResult> {
    try {
      if (args.kind === 'user') {
        // Requirements: llm-integration.3.8
        // Hide visible error messages before creating the next user message.
        this.messageManager.hideErrorMessages(args.agentId);
      }

      const lastMessage = this.messageManager.getLastMessage(args.agentId);
      const replyToMessageId = lastMessage?.id ?? null;
      const done = args.kind === 'llm' ? false : true;
      const message = this.messageManager.create(
        args.agentId,
        args.kind,
        args.payload,
        replyToMessageId,
        done
      );
      this.logger.info(`Message created: ${message.id} for agent ${args.agentId}`);
      // Convert to snapshot with parsed payload
      const snapshot = this.messageManager.toEventMessage(message);

      // Launch LLM pipeline asynchronously for user messages
      // Requirements: llm-integration.6, llm-integration.3.8
      if (args.kind === 'user') {
        // Cancel any running pipeline for this agent
        this.agentManager.cancelPipeline(args.agentId);

        // Create a new AbortController for this pipeline run
        const controller = new AbortController();
        this.agentManager.setPipelineController(args.agentId, controller);

        // Run pipeline in background — do not await
        this.pipeline
          .run(args.agentId, message.id, controller.signal)
          .catch((err: unknown) => {
            // MainPipeline handles LLM errors internally (creates kind:error message).
            // This catch handles unexpected errors that escape the pipeline.
            // Requirements: error-notifications.1.1, error-notifications.1.5
            handleBackgroundError(err, 'LLM Pipeline');
          })
          .finally(() => {
            // Clean up controller reference only if it's still ours (not replaced by a newer message)
            this.agentManager.clearPipelineController(args.agentId, controller);
          });
      }

      return { success: true, data: snapshot };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create message: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle messages:update request
   * Requirements: agents.7.1
   */
  private async handleMessageUpdate(
    _event: IpcMainInvokeEvent,
    args: { messageId: number; agentId: string; payload: MessagePayload }
  ): Promise<IPCResult> {
    try {
      this.messageManager.update(args.messageId, args.agentId, args.payload);
      this.logger.info(`Message updated: ${args.messageId}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to update message: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle messages:cancel request
   * Cancels the currently running pipeline for the agent (if any)
   * Requirements: llm-integration.8.1, llm-integration.8.7
   */
  private async handleMessageCancel(
    _event: IpcMainInvokeEvent,
    args: { agentId: string }
  ): Promise<IPCResult> {
    try {
      this.agentManager.cancelPipeline(args.agentId);

      // Requirements: llm-integration.8.5, llm-integration.8.7
      // Cancel is treated as "discard current turn":
      // - hide pending user message if generation hasn't produced an llm message yet
      // - hide in-flight llm message and its reply-to user message when present
      const lastMessage = this.messageManager.getLastMessage(args.agentId);
      if (lastMessage && !lastMessage.hidden) {
        if (lastMessage.kind === 'user') {
          this.messageManager.setHidden(lastMessage.id, args.agentId);
        } else if (lastMessage.kind === 'llm' && !lastMessage.done) {
          this.messageManager.setHidden(lastMessage.id, args.agentId);
          if (lastMessage.replyToMessageId !== null) {
            this.messageManager.setHidden(lastMessage.replyToMessageId, args.agentId);
          }
        }
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to cancel message pipeline: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle messages:retry-last request
   * Re-runs the pipeline with the same userMessageId after rate limit countdown
   * Requirements: llm-integration.3.7.3
   */
  private async handleMessageRetryLast(
    _event: IpcMainInvokeEvent,
    args: { agentId: string }
  ): Promise<IPCResult> {
    try {
      // Hide existing error dialogs before retrying the request.
      this.messageManager.hideErrorMessages(args.agentId);
      const lastUser = this.messageManager.getLastUserMessage(args.agentId);
      if (!lastUser) {
        return { success: false, error: 'No user message to retry' };
      }
      // Cancel any running pipeline for this agent
      this.agentManager.cancelPipeline(args.agentId);

      // Create a new AbortController for this pipeline run
      const controller = new AbortController();
      this.agentManager.setPipelineController(args.agentId, controller);

      // Run pipeline in background — do not await
      this.pipeline
        .run(args.agentId, lastUser.id, controller.signal)
        .catch((err: unknown) => {
          handleBackgroundError(err, 'LLM Pipeline (retry)');
        })
        .finally(() => {
          this.agentManager.cancelPipeline(args.agentId);
        });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to retry last message: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle messages:cancel-retry request
   * Hides the user message (hidden=true) so it disappears from chat and LLM history
   * Requirements: llm-integration.3.7.4
   */
  private async handleMessageCancelRetry(
    _event: IpcMainInvokeEvent,
    args: { agentId: string; userMessageId: number }
  ): Promise<IPCResult> {
    try {
      this.messageManager.setHidden(args.userMessageId, args.agentId);
      this.logger.info(`Rate limit retry cancelled, message hidden: ${args.userMessageId}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to cancel retry: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }
}
