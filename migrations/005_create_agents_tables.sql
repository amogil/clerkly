-- Migration: 005_create_agents_tables
-- Requirements: drizzle-migration.7.1, drizzle-migration.2.3, drizzle-migration.2.4
-- Creates agents and messages tables for the AI agents feature

-- ============================================
-- Agents Table
-- ============================================
CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
);

-- Index for listing non-archived agents by user
CREATE INDEX IF NOT EXISTS idx_agents_user_archived ON agents(user_id, archived_at);

-- Index for sorting by updated_at (for listing agents sorted by recent activity)
CREATE INDEX IF NOT EXISTS idx_agents_user_updated ON agents(user_id, archived_at, updated_at);

-- ============================================
-- Messages Table
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    payload_json TEXT NOT NULL
);

-- Index for listing messages by agent
CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON messages(agent_id);

-- Index for listing messages by agent sorted by timestamp
CREATE INDEX IF NOT EXISTS idx_messages_agent_timestamp ON messages(agent_id, timestamp);

-- DOWN
DROP INDEX IF EXISTS idx_messages_agent_timestamp;
DROP INDEX IF EXISTS idx_messages_agent_id;
DROP TABLE IF EXISTS messages;
DROP INDEX IF EXISTS idx_agents_user_updated;
DROP INDEX IF EXISTS idx_agents_user_archived;
DROP TABLE IF EXISTS agents;
