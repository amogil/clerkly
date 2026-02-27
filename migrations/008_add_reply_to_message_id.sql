-- Migration: 008_add_reply_to_message_id
-- Requirements: llm-integration.1.7, llm-integration.3.3
-- Adds reply_to_message_id column to messages table and backfills from payload_json

-- UP
ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER;

-- Backfill from payload_json
UPDATE messages
SET reply_to_message_id = json_extract(payload_json, '$.data.reply_to_message_id')
WHERE json_extract(payload_json, '$.data.reply_to_message_id') IS NOT NULL;

-- Remove reply_to_message_id from payload_json now that it lives in its own column
UPDATE messages
SET payload_json = json_remove(payload_json, '$.data.reply_to_message_id')
WHERE json_extract(payload_json, '$.data.reply_to_message_id') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_agent_reply_to
  ON messages(agent_id, reply_to_message_id);

-- DOWN
DROP INDEX IF EXISTS idx_messages_agent_reply_to;
-- SQLite does not support DROP COLUMN in older versions; migration is irreversible
