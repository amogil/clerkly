// Requirements: user-data-isolation.6.2, user-data-isolation.7.6
// src/main/db/repositories/MessagesRepository.ts
// Repository for messages with access control through AgentsRepository

import { eq, and, asc, desc, lt, or } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { messages, agents, Message } from '../schema';
import { AgentsRepository } from './AgentsRepository';

export interface MessageOrderColumns {
  runId?: string | null;
  attemptId?: number | null;
  sequence?: number | null;
}

export class MessagesRepository {
  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    private getUserId: () => string,
    private agentsRepo: AgentsRepository
  ) {}

  /**
   * Check if the current user has access to the agent
   * Throws "Access denied" if not
   * Requirements: user-data-isolation.7.6
   */
  private checkAccess(agentId: string): void {
    const agent = this.agentsRepo.findById(agentId);
    if (!agent) {
      throw new Error('Access denied');
    }
  }

  /**
   * List messages for an agent, sorted by id ASC
   * By default excludes hidden messages.
   * Requirements: user-data-isolation.7.6, llm-integration.3.8, llm-integration.8.5
   */
  listByAgent(agentId: string, includeHidden = false): Message[] {
    this.checkAccess(agentId);
    const condition = includeHidden
      ? eq(messages.agentId, agentId)
      : and(eq(messages.agentId, agentId), eq(messages.hidden, false));
    return this.db.select().from(messages).where(condition).orderBy(asc(messages.id)).all();
  }

  /**
   * Get the last message for an agent (most recent by timestamp)
   * Returns null if no messages exist
   * Works for both active and archived agents (filtering happens at AgentsRepository.list level)
   * Uses optimized SQL query: ORDER BY timestamp DESC LIMIT 1
   * Requirements: agents.5.5
   */
  getLastByAgent(agentId: string): Message | null {
    this.checkAccess(agentId);

    // Optimized: ORDER BY timestamp DESC LIMIT 1 - only fetches the last message
    const result = this.db
      .select()
      .from(messages)
      .where(eq(messages.agentId, agentId))
      .orderBy(desc(messages.timestamp))
      .limit(1)
      .all();

    const message = result[0];
    return message ?? null;
  }

  /**
   * Get the last user message for an agent (most recent by id)
   * Returns null if no user messages exist
   * Requirements: llm-integration.3.4.3, llm-integration.3.7.3
   */
  getLastUserByAgent(agentId: string): Message | null {
    this.checkAccess(agentId);
    const result = this.db
      .select()
      .from(messages)
      .where(
        and(eq(messages.agentId, agentId), eq(messages.kind, 'user'), eq(messages.hidden, false))
      )
      .orderBy(desc(messages.timestamp))
      .limit(1)
      .all();

    const message = result[0];
    return message ?? null;
  }

  /**
   * Create a new message for an agent
   * Requirements: user-data-isolation.7.6, llm-integration.2
   * @param kind Message kind: 'user' | 'llm' | 'error' | etc.
   * @param timestamp Optional timestamp (ISO string). Can only be used in test environment.
   * @throws {Error} If timestamp is provided outside test environment
   */
  create(
    agentId: string,
    kind: string,
    payloadJson: string,
    replyToMessageId: number | null,
    done: boolean = false,
    timestamp?: string,
    order?: MessageOrderColumns
  ): Message {
    this.checkAccess(agentId);

    // Validate timestamp parameter is only used in tests
    if (timestamp && process.env.NODE_ENV !== 'test' && process.env.PLAYWRIGHT_TEST !== '1') {
      throw new Error('timestamp parameter can only be used in test environment');
    }

    const messageTimestamp = timestamp ?? new Date().toISOString();

    const message = this.db
      .insert(messages)
      .values({
        agentId,
        kind,
        timestamp: messageTimestamp,
        payloadJson,
        replyToMessageId,
        done,
        runId: order?.runId ?? null,
        attemptId: order?.attemptId ?? null,
        sequence: order?.sequence ?? null,
      })
      .returning()
      .get();

    return message;
  }

  /**
   * Get a single message by id (with access control)
   * Returns null if not found or access denied
   * Requirements: user-data-isolation.7.6
   */
  getById(messageId: number, agentId: string): Message | null {
    this.checkAccess(agentId);
    const result = this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.agentId, agentId)))
      .limit(1)
      .all();
    return result[0] ?? null;
  }

  /**
   * Mark all visible (hidden=false) kind:error messages for an agent as hidden.
   * Returns only the records that were actually changed (were visible before the update).
   * Called before creating a new kind:user message so error bubbles disappear from UI.
   * Requirements: llm-integration.3.8
   */
  hideErrorMessages(agentId: string): Message[] {
    this.checkAccess(agentId);
    return this.db
      .update(messages)
      .set({ hidden: true })
      .where(
        and(eq(messages.agentId, agentId), eq(messages.kind, 'error'), eq(messages.hidden, false))
      )
      .returning()
      .all();
  }

  /**
   * Set hidden flag on a specific message
   * Used to hide cancelled llm messages from UI and LLM history
   * Requirements: llm-integration.8.5
   */
  setHidden(messageId: number, agentId: string): void {
    this.checkAccess(agentId);
    this.db
      .update(messages)
      .set({ hidden: true })
      .where(and(eq(messages.id, messageId), eq(messages.agentId, agentId)))
      .run();
  }

  /**
   * Mark in-flight llm message as hidden and incomplete in a single DB update.
   * Returns updated message only when state actually changed.
   * Requirements: llm-integration.3.2, llm-integration.8.5
   */
  hideAndMarkIncomplete(messageId: number, agentId: string): Message | null {
    this.checkAccess(agentId);
    const updatedRows = this.db
      .update(messages)
      .set({ hidden: true, done: false })
      .where(
        and(
          eq(messages.id, messageId),
          eq(messages.agentId, agentId),
          // Avoid redundant updates/events when row is already in target state.
          or(eq(messages.hidden, false), eq(messages.done, true))
        )
      )
      .returning()
      .all();
    return updatedRows[0] ?? null;
  }

  /**
   * Update done flag on a specific message.
   * Requirements: llm-integration.1.6.1, llm-integration.1.6.2, llm-integration.6.5
   */
  setDone(messageId: number, agentId: string, done: boolean): void {
    this.checkAccess(agentId);
    this.db
      .update(messages)
      .set({ done })
      .where(and(eq(messages.id, messageId), eq(messages.agentId, agentId)))
      .run();
  }

  /**
   * List messages for an agent with pagination (last N messages, optionally before a given id).
   * Returns messages in ascending order (oldest first) and a hasMore flag.
   * Requirements: agents.13.1, agents.13.2, agents.13.4
   */
  listByAgentPaginated(
    agentId: string,
    limit: number,
    beforeId?: number
  ): { messages: Message[]; hasMore: boolean } {
    this.checkAccess(agentId);

    // Fetch limit+1 to detect if there are more messages
    const fetchLimit = limit + 1;

    const whereClause =
      beforeId !== undefined
        ? and(eq(messages.agentId, agentId), eq(messages.hidden, false), lt(messages.id, beforeId))
        : and(eq(messages.agentId, agentId), eq(messages.hidden, false));

    // Fetch in DESC order to get the latest N, then reverse for chronological display
    const rows = this.db
      .select()
      .from(messages)
      .where(whereClause)
      .orderBy(desc(messages.id))
      .limit(fetchLimit)
      .all();

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse(); // oldest first
    return { messages: page, hasMore };
  }

  /**
   * Update a message's payload
   * Requirements: user-data-isolation.7.6
   */
  update(
    messageId: number,
    agentId: string,
    payloadJson: string,
    done?: boolean,
    order?: MessageOrderColumns
  ): void {
    this.checkAccess(agentId);
    const patch: {
      payloadJson: string;
      done?: boolean;
      runId?: string | null;
      attemptId?: number | null;
      sequence?: number | null;
    } = { payloadJson };
    if (done !== undefined) {
      patch.done = done;
    }
    if (order && 'runId' in order) {
      patch.runId = order.runId ?? null;
    }
    if (order && 'attemptId' in order) {
      patch.attemptId = order.attemptId ?? null;
    }
    if (order && 'sequence' in order) {
      patch.sequence = order.sequence ?? null;
    }

    this.db
      .update(messages)
      .set(patch)
      .where(and(eq(messages.id, messageId), eq(messages.agentId, agentId)))
      .run();
  }

  /**
   * Update usage envelope JSON for a message.
   * Requirements: llm-integration.13
   */
  updateUsageJson(messageId: number, agentId: string, usageJson: string): void {
    this.checkAccess(agentId);

    this.db
      .update(messages)
      .set({ usageJson })
      .where(and(eq(messages.id, messageId), eq(messages.agentId, agentId)))
      .run();
  }

  /**
   * List all stale tool_call messages (done=false) across all agents for the current user.
   * Includes both hidden and visible rows. Used for startup reconciliation.
   * Bypasses per-agent checkAccess — filters by userId via agents join instead.
   * Requirements: llm-integration.11.6.3
   */
  listStaleToolCalls(): Message[] {
    const userId = this.getUserId();
    return this.db
      .select({
        id: messages.id,
        agentId: messages.agentId,
        kind: messages.kind,
        runId: messages.runId,
        attemptId: messages.attemptId,
        sequence: messages.sequence,
        timestamp: messages.timestamp,
        payloadJson: messages.payloadJson,
        usageJson: messages.usageJson,
        replyToMessageId: messages.replyToMessageId,
        hidden: messages.hidden,
        done: messages.done,
      })
      .from(messages)
      .innerJoin(agents, eq(messages.agentId, agents.agentId))
      .where(
        and(eq(agents.userId, userId), eq(messages.kind, 'tool_call'), eq(messages.done, false))
      )
      .orderBy(asc(messages.id))
      .all();
  }

  /**
   * List all stale kind:llm messages (done=false, hidden=false) across all agents for the current user.
   * Only targets hidden=false rows because hidden=true llm messages are already in the correct state.
   * Bypasses per-agent checkAccess — filters by userId via agents join instead.
   * Requirements: llm-integration.11.6.4
   */
  listStaleLlmMessages(): Message[] {
    const userId = this.getUserId();
    return this.db
      .select({
        id: messages.id,
        agentId: messages.agentId,
        kind: messages.kind,
        runId: messages.runId,
        attemptId: messages.attemptId,
        sequence: messages.sequence,
        timestamp: messages.timestamp,
        payloadJson: messages.payloadJson,
        usageJson: messages.usageJson,
        replyToMessageId: messages.replyToMessageId,
        hidden: messages.hidden,
        done: messages.done,
      })
      .from(messages)
      .innerJoin(agents, eq(messages.agentId, agents.agentId))
      .where(
        and(
          eq(agents.userId, userId),
          eq(messages.kind, 'llm'),
          eq(messages.done, false),
          eq(messages.hidden, false)
        )
      )
      .orderBy(asc(messages.id))
      .all();
  }
}
