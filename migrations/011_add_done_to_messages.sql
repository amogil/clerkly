-- Migration: 011_add_done_to_messages
-- Requirements: llm-integration.1.6.1, llm-integration.1.6.2, llm-integration.3.1.1, llm-integration.6.5, llm-integration.6.6
-- Adds done flag for message completion lifecycle and backfills existing rows.

-- UP
ALTER TABLE messages ADD COLUMN done INTEGER NOT NULL DEFAULT 0;

-- Backfill completion semantics for existing data
UPDATE messages
SET done = CASE
  WHEN kind = 'user' THEN 1
  WHEN kind = 'error' THEN 1
  ELSE 0
END;

CREATE INDEX IF NOT EXISTS idx_messages_agent_done ON messages(agent_id, done);

-- DOWN
DROP INDEX IF EXISTS idx_messages_agent_done;
-- SQLite does not support DROP COLUMN in older versions; migration is irreversible.
