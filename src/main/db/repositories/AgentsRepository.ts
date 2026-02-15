// Requirements: user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.7.6
// src/main/db/repositories/AgentsRepository.ts
// Repository for agents with automatic userId filtering

import { eq, and, isNull, desc } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { agents, Agent } from '../schema';

export class AgentsRepository {
  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    private getUserId: () => string
  ) {}

  /**
   * List all non-archived agents for the current user, sorted by updatedAt DESC
   * Requirements: user-data-isolation.6.3, user-data-isolation.7.6
   */
  list(): Agent[] {
    const userId = this.getUserId();
    return this.db
      .select()
      .from(agents)
      .where(and(eq(agents.userId, userId), isNull(agents.archivedAt)))
      .orderBy(desc(agents.updatedAt))
      .all();
  }

  /**
   * Find an agent by ID for the current user
   * Requirements: user-data-isolation.6.3, user-data-isolation.7.6
   */
  findById(agentId: string): Agent | undefined {
    const userId = this.getUserId();
    return this.db
      .select()
      .from(agents)
      .where(and(eq(agents.userId, userId), eq(agents.agentId, agentId)))
      .get();
  }

  /**
   * Create a new agent for the current user
   * Requirements: user-data-isolation.6.3, user-data-isolation.7.6
   */
  create(name: string = 'New Agent'): Agent {
    const userId = this.getUserId();
    const agentId = this.generateId();
    const now = new Date().toISOString();

    return this.db
      .insert(agents)
      .values({ agentId, userId, name, createdAt: now, updatedAt: now })
      .returning()
      .get();
  }

  /**
   * Update an agent's name for the current user
   * Requirements: user-data-isolation.6.3, user-data-isolation.7.6
   */
  update(agentId: string, data: Partial<Pick<Agent, 'name'>>): void {
    const userId = this.getUserId();
    const now = new Date().toISOString();

    this.db
      .update(agents)
      .set({ ...data, updatedAt: now })
      .where(and(eq(agents.userId, userId), eq(agents.agentId, agentId)))
      .run();
  }

  /**
   * Archive an agent (soft delete) for the current user
   * Requirements: user-data-isolation.6.3, user-data-isolation.7.6
   */
  archive(agentId: string): void {
    const userId = this.getUserId();
    const now = new Date().toISOString();

    this.db
      .update(agents)
      .set({ archivedAt: now })
      .where(and(eq(agents.userId, userId), eq(agents.agentId, agentId)))
      .run();
  }

  /**
   * Update the updatedAt timestamp for an agent
   * Used when messages are added to update the agent's last activity
   * Requirements: user-data-isolation.7.6
   */
  touch(agentId: string): void {
    const now = new Date().toISOString();
    this.db.update(agents).set({ updatedAt: now }).where(eq(agents.agentId, agentId)).run();
  }

  /**
   * Generate a 10-character alphanumeric ID
   */
  private generateId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
