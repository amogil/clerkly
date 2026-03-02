-- Requirements: llm-integration.1
CREATE TABLE IF NOT EXISTS images (
  agent_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  image_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  hash TEXT,
  content_type TEXT,
  size INTEGER,
  bytes BLOB,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (agent_id, message_id, image_id)
);
