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

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Create a new message for an agent
   * Also updates the agent's updatedAt timestamp
   * Requirements: user-data-isolation.7.6
   */
  create(agentId: string, payloadJson: string): Message {
    this.checkAccess(agentId);
    const now = new Date().toISOString();

    const message = this.db
      .insert(messages)
      .values({ agentId, timestamp: now, payloadJson })
      .returning()
      .get();

    // Update agent's updatedAt
    this.agentsRepo.touch(agentId);

    return message;
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
