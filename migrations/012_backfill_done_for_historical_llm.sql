-- Migration: 012_backfill_done_for_historical_llm
-- Requirements: llm-integration.6.6
-- Backfills historical completed llm messages to done=1.

-- UP
UPDATE messages
SET done = 1
WHERE kind = 'llm'
  AND done = 0
  AND json_type(payload_json, '$.data.action') = 'object';

-- DOWN
-- Irreversible data backfill migration.
