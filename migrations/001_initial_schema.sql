-- Requirements: clerkly.1, clerkly.2, ui.12.2, ui.12.9
-- Initial database schema with user data isolation support

-- UP
CREATE TABLE user_data (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  user_email TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, user_email)
);

CREATE INDEX idx_timestamp ON user_data(timestamp);
CREATE INDEX idx_user_email ON user_data(user_email);

-- DOWN
DROP INDEX IF EXISTS idx_user_email;
DROP INDEX IF EXISTS idx_timestamp;
DROP TABLE IF EXISTS user_data;
