-- Migration: 013_backfill_llm_data_text_from_action
-- Requirements: llm-integration.6.6.1
-- Backfills legacy historical llm payloads from data.action.content into canonical data.text.

-- UP
UPDATE messages
SET payload_json = json_remove(
  json_set(payload_json, '$.data.text', json_extract(payload_json, '$.data.action.content')),
  '$.data.action'
)
WHERE kind = 'llm'
  AND json_valid(payload_json) = 1
  AND json_type(payload_json, '$.data.action.content') = 'text'
  AND (
    json_type(payload_json, '$.data.text') IS NULL
    OR (
      json_type(payload_json, '$.data.text') = 'text'
      AND trim(json_extract(payload_json, '$.data.text')) = ''
    )
  );

-- DOWN
-- Irreversible data backfill migration.
