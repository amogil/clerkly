// Requirements: user-data-isolation.7.7
// src/main/db/repositories/UsersRepository.ts
// Repository for users - works without requiring current userId (for auth)

import { eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { users, User } from '../schema';

export class UsersRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  /**
   * Find a user by email
   * Requirements: user-data-isolation.7.7
   */
  findByEmail(email: string): User | undefined {
    return this.db.select().from(users).where(eq(users.email, email)).get();
  }

  /**
   * Find a user by ID
   * Requirements: user-data-isolation.7.7
   */
  findById(userId: string): User | undefined {
    return this.db.select().from(users).where(eq(users.userId, userId)).get();
  }

  /**
   * Find or create a user by email
   * If user exists and name changed, updates the name
   * Requirements: user-data-isolation.7.7
   */
  findOrCreate(email: string, name: string | null): User {
    const existing = this.findByEmail(email);
    if (existing) {
      // Update name if changed
      if (name !== null && existing.name !== name) {
        this.update(existing.userId, { name });
        return { ...existing, name };
      }
      return existing;
    }

    const userId = this.generateId();
    return this.db.insert(users).values({ userId, email, name }).returning().get();
  }

  /**
   * Update user data
   * Requirements: user-data-isolation.7.7
   */
  update(
    userId: string,
    data: Partial<Pick<User, 'name' | 'googleId' | 'locale' | 'lastSynced'>>
  ): void {
    this.db.update(users).set(data).where(eq(users.userId, userId)).run();
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
