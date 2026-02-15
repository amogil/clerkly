// Requirements: user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.7.6
// src/main/db/repositories/SettingsRepository.ts
// Repository for user settings (key-value storage) with automatic userId filtering

import { eq, and } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { userData, UserData } from '../schema';

export class SettingsRepository {
  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    private getUserId: () => string // throws if not logged in
  ) {}

  /**
   * Get a setting value by key for the current user
   * Requirements: user-data-isolation.6.3, user-data-isolation.7.6
   */
  get(key: string): UserData | undefined {
    const userId = this.getUserId();
    return this.db
      .select()
      .from(userData)
      .where(and(eq(userData.userId, userId), eq(userData.key, key)))
      .get();
  }

  /**
   * Set a setting value for the current user (upsert)
   * Requirements: user-data-isolation.6.3, user-data-isolation.7.6
   */
  set(key: string, value: string): void {
    const userId = this.getUserId();
    const now = Date.now();

    this.db
      .insert(userData)
      .values({ key, userId, value, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [userData.key, userData.userId],
        set: { value, updatedAt: now },
      })
      .run();
  }

  /**
   * Delete a setting for the current user
   * Requirements: user-data-isolation.6.3, user-data-isolation.7.6
   * @returns true if a row was deleted, false otherwise
   */
  delete(key: string): boolean {
    const userId = this.getUserId();
    const result = this.db
      .delete(userData)
      .where(and(eq(userData.userId, userId), eq(userData.key, key)))
      .run();
    return result.changes > 0;
  }

  /**
   * Get all settings for the current user
   * Requirements: user-data-isolation.6.3, user-data-isolation.7.6
   */
  getAll(): UserData[] {
    const userId = this.getUserId();
    return this.db.select().from(userData).where(eq(userData.userId, userId)).all();
  }
}
