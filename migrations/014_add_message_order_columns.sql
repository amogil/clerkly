-- Migration: 014_add_message_order_columns
-- Requirements: llm-integration.6.7, llm-integration.6.8, llm-integration.6.9, llm-integration.6.10
-- Adds dedicated message order columns and backfills legacy payload.data.order.

-- UP
ALTER TABLE messages ADD COLUMN run_id TEXT;
ALTER TABLE messages ADD COLUMN attempt_id INTEGER;
ALTER TABLE messages ADD COLUMN sequence INTEGER;

UPDATE messages
SET run_id = json_extract(payload_json, '$.data.order.runId')
WHERE run_id IS NULL
  AND json_valid(payload_json) = 1
  AND json_type(payload_json, '$.data.order.runId') = 'text';

UPDATE messages
SET attempt_id = json_extract(payload_json, '$.data.order.attemptId')
WHERE attempt_id IS NULL
  AND json_valid(payload_json) = 1
  AND json_type(payload_json, '$.data.order.attemptId') IN ('integer', 'real');

UPDATE messages
SET sequence = json_extract(payload_json, '$.data.order.sequence')
WHERE sequence IS NULL
  AND json_valid(payload_json) = 1
  AND json_type(payload_json, '$.data.order.sequence') IN ('integer', 'real');

UPDATE messages
SET payload_json = json_remove(payload_json, '$.data.order')
WHERE json_valid(payload_json) = 1
  AND json_type(payload_json, '$.data.order') = 'object';

CREATE INDEX IF NOT EXISTS idx_messages_run_attempt_sequence
  ON messages(run_id, attempt_id, sequence);

-- DOWN
DROP INDEX IF EXISTS idx_messages_run_attempt_sequence;
-- SQLite does not support DROP COLUMN in older versions; migration is irreversible.
