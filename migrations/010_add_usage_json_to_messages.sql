-- Requirements: llm-integration.13
-- UP
ALTER TABLE messages ADD COLUMN usage_json TEXT;

-- DOWN
-- SQLite does not support DROP COLUMN in older versions; keep schema and no-op rollback.
SELECT 1;
