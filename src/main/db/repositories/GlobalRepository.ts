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
}
