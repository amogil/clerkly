-- Migration: 007_add_hidden_to_messages
-- Requirements: llm-integration.3.8, llm-integration.8.5
-- Adds hidden column to messages table for filtering interrupted/dismissed messages

-- UP
ALTER TABLE messages ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_messages_agent_hidden ON messages(agent_id, hidden);

-- DOWN
DROP INDEX IF EXISTS idx_messages_agent_hidden;
-- SQLite does not support DROP COLUMN in older versions; migration is irreversible
