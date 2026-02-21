-- UP
ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'user';
UPDATE messages SET payload_json = json_remove(payload_json, '$.kind');

-- DOWN
CREATE TABLE messages_backup AS SELECT id, agent_id, timestamp, payload_json FROM messages;
DROP TABLE messages;
ALTER TABLE messages_backup RENAME TO messages;
