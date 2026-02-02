-- UP
CREATE TABLE user_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_timestamp ON user_data(timestamp);

-- DOWN
DROP INDEX IF EXISTS idx_timestamp;
DROP TABLE IF EXISTS user_data;
