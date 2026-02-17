// Requirements: user-data-isolation.7.8
// src/main/db/repositories/GlobalRepository.ts
// Repository for global data (without userId filtering)

import { eq, and } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { userData } from '../schema';

const SYSTEM_USER_ID = '__system__';

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

export class GlobalRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  /**
   * Window state management
   * Requirements: user-data-isolation.7.8
   */
  windowState = {
    /**
     * Get the saved window state
     */
    get: (): WindowState | undefined => {
      const row = this.db
        .select()
        .from(userData)
        .where(and(eq(userData.key, 'window_state'), eq(userData.userId, SYSTEM_USER_ID)))
        .get();

      if (row) {
        return JSON.parse(row.value);
      }
      return undefined;
    },

    /**
     * Save the window state
     */
    set: (state: WindowState): void => {
      const now = Date.now();
      const value = JSON.stringify(state);

      this.db
        .insert(userData)
        .values({
          key: 'window_state',
          userId: SYSTEM_USER_ID,
          value,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [userData.key, userData.userId],
          set: { value, updatedAt: now },
        })
        .run();
    },
  };

  /**
   * Current user management
   * Requirements: user-data-isolation.1.6
   */
  currentUser = {
    /**
     * Get saved userId from global storage
     */
    getUserId: (): string | null => {
      const row = this.db
        .select()
        .from(userData)
        .where(and(eq(userData.key, 'current_user_id'), eq(userData.userId, SYSTEM_USER_ID)))
        .get();

      return row ? row.value : null;
    },

    /**
     * Save userId to global storage
     */
    setUserId: (userId: string): void => {
      const now = Date.now();

      this.db
        .insert(userData)
        .values({
          key: 'current_user_id',
          userId: SYSTEM_USER_ID,
          value: userId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [userData.key, userData.userId],
          set: { value: userId, updatedAt: now },
        })
        .run();
    },

    /**
     * Clear userId from global storage
     */
    clearUserId: (): void => {
      this.db
        .delete(userData)
        .where(and(eq(userData.key, 'current_user_id'), eq(userData.userId, SYSTEM_USER_ID)))
        .run();
    },
  };
}
