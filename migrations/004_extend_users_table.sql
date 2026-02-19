-- Requirements: account-profile.1.2
-- Extends users table with Google OAuth profile data

-- UP
ALTER TABLE users ADD COLUMN google_id TEXT;
ALTER TABLE users ADD COLUMN locale TEXT;
ALTER TABLE users ADD COLUMN last_synced INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- DOWN
DROP INDEX IF EXISTS idx_users_google_id;
-- SQLite doesn't support DROP COLUMN, so we need to recreate the table
CREATE TABLE users_backup (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE
);
INSERT INTO users_backup SELECT user_id, name, email FROM users;
DROP TABLE users;
ALTER TABLE users_backup RENAME TO users;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
