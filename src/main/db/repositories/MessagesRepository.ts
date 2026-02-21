// Requirements: user-data-isolation.6.2, user-data-isolation.7.6
// src/main/db/repositories/MessagesRepository.ts
// Repository for messages with access control through AgentsRepository

import { eq, and, asc, desc } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { messages, Message } from '../schema';
import { AgentsRepository } from './AgentsRepository';

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
   * List all messages for an agent, sorted by id ASC
   * Requirements: user-data-isolation.7.6
   */
  listByAgent(agentId: string): Message[] {
    this.checkAccess(agentId);
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.agentId, agentId))
      .orderBy(asc(messages.id))
      .all();
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
   * Create a new message for an agent
   * Requirements: user-data-isolation.7.6, llm-integration.2
   * @param kind Message kind: 'user' | 'llm' | 'error' | etc.
   * @param timestamp Optional timestamp (ISO string). Can only be used in test environment.
   * @throws {Error} If timestamp is provided outside test environment
   */
  create(agentId: string, kind: string, payloadJson: string, timestamp?: string): Message {
    this.checkAccess(agentId);

    // Validate timestamp parameter is only used in tests
    if (timestamp && process.env.NODE_ENV !== 'test' && process.env.PLAYWRIGHT_TEST !== '1') {
      throw new Error('timestamp parameter can only be used in test environment');
    }

    const messageTimestamp = timestamp ?? new Date().toISOString();

    const message = this.db
      .insert(messages)
      .values({ agentId, kind, timestamp: messageTimestamp, payloadJson })
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
   * Update a message's payload
   * Requirements: user-data-isolation.7.6
   */
  update(messageId: number, agentId: string, payloadJson: string): void {
    this.checkAccess(agentId);

    this.db
      .update(messages)
      .set({ payloadJson })
      .where(and(eq(messages.id, messageId), eq(messages.agentId, agentId)))
      .run();
  }
}
