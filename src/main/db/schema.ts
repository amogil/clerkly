// Requirements: user-data-isolation.7.3
// src/main/db/schema.ts
// Declarative schema for all database tables

import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

// ============================================
// Users Table
// Requirements: user-data-isolation.7.3, user-data-isolation.7.4
// ============================================

export const users = sqliteTable(
  'users',
  {
    userId: text('user_id').primaryKey(),
    name: text('name'),
    email: text('email').notNull().unique(),
    googleId: text('google_id'),
    locale: text('locale'),
    lastSynced: integer('last_synced'),
  },
  (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_google_id').on(table.googleId),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ============================================
// User Data Table (Key-Value Storage)
// Requirements: user-data-isolation.7.3, user-data-isolation.7.4
// ============================================

export const userData = sqliteTable(
  'user_data',
  {
    key: text('key').notNull(),
    userId: text('user_id').notNull(),
    value: text('value').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.userId] }),
    index('idx_user_id').on(table.userId),
  ]
);

export type UserData = typeof userData.$inferSelect;
export type NewUserData = typeof userData.$inferInsert;

// ============================================
// Agents Table
// Requirements: user-data-isolation.7.3, user-data-isolation.7.4
// ============================================

export const agents = sqliteTable(
  'agents',
  {
    agentId: text('agent_id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
  },
  (table) => [
    index('idx_agents_user_archived').on(table.userId, table.archivedAt),
    index('idx_agents_user_updated').on(table.userId, table.archivedAt, table.updatedAt),
  ]
);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

// ============================================
// Messages Table
// Requirements: user-data-isolation.7.3, user-data-isolation.7.4
// ============================================

export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agentId: text('agent_id').notNull(),
    kind: text('kind').notNull(),
    timestamp: text('timestamp').notNull(),
    payloadJson: text('payload_json').notNull(),
    // Requirements: llm-integration.13
    // Canonical + raw provider token usage envelope for billing pipeline.
    usageJson: text('usage_json'),
    replyToMessageId: integer('reply_to_message_id'),
    // Requirements: llm-integration.3.8, llm-integration.8.5
    // Unified flag: hides message from UI and LLM history.
    // Set for cancelled llm messages and hidden error messages.
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    // Requirements: llm-integration.1.6.1, llm-integration.1.6.2, llm-integration.6.5
    // Completion flag for message lifecycle.
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    index('idx_messages_agent_id').on(table.agentId),
    index('idx_messages_agent_timestamp').on(table.agentId, table.timestamp),
    // Composite index for filtering visible messages by agent
    // Requirements: llm-integration.3.8, llm-integration.8.5
    index('idx_messages_agent_hidden').on(table.agentId, table.hidden),
  ]
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
