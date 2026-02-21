-- Migration: 006_add_kind_to_messages
-- Requirements: llm-integration.3.1
-- Adds kind column to messages table (user, llm, error)
-- Backfills kind from payload_json and removes it from payload

-- UP
ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'user';

-- Backfill: extract kind from payload_json for existing records
-- (kind was previously stored inside payload_json as a top-level field)
UPDATE messages SET kind = COALESCE(
    json_extract(payload_json, '$.kind'),
    'user'
);

-- Remove kind from payload_json now that it lives in its own column
UPDATE messages SET payload_json = json_remove(payload_json, '$.kind')
WHERE json_extract(payload_json, '$.kind') IS NOT NULL;

-- DOWN
-- SQLite does not support DROP COLUMN in older versions; migration is irreversible
