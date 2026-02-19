-- Requirements: user-data-isolation.2.1, user-data-isolation.2.2, user-data-isolation.5.1, user-data-isolation.5.2, user-data-isolation.5.3, user-data-isolation.5.4
-- Migrates user_data from user_email to user_id, removes timestamp column

-- UP

-- Step 1: Create users records for each unique email in user_data
-- Uses hex(randomblob(5)) to generate 10-character hex ID (0-9, A-F)
INSERT OR IGNORE INTO users (user_id, name, email)
SELECT 
  upper(substr(hex(randomblob(5)), 1, 10)) as user_id,
  NULL as name,
  user_email as email
FROM user_data
WHERE user_email IS NOT NULL
GROUP BY user_email;

-- Step 2: Create new user_data table with user_id instead of user_email
-- Note: timestamp column is removed, only created_at and updated_at remain
CREATE TABLE user_data_new (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, user_id)
);

-- Step 3: Copy data with email -> user_id mapping
INSERT INTO user_data_new (key, value, user_id, created_at, updated_at)
SELECT 
  ud.key,
  ud.value,
  u.user_id,
  ud.created_at,
  ud.updated_at
FROM user_data ud
JOIN users u ON ud.user_email = u.email;

-- Step 4: Drop old table and rename new one
DROP TABLE user_data;
ALTER TABLE user_data_new RENAME TO user_data;

-- Step 5: Create index on user_id
CREATE INDEX IF NOT EXISTS idx_user_id ON user_data(user_id);

-- DOWN

-- Step 1: Add user_email column back to user_data
ALTER TABLE user_data ADD COLUMN user_email TEXT;

-- Step 2: Populate user_email from users table
UPDATE user_data 
SET user_email = (SELECT email FROM users WHERE users.user_id = user_data.user_id);

-- Step 3: Add timestamp column back (use updated_at as timestamp)
ALTER TABLE user_data ADD COLUMN timestamp INTEGER;
UPDATE user_data SET timestamp = updated_at;

-- Step 4: Recreate old table structure
CREATE TABLE user_data_old (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  user_email TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, user_email)
);

-- Step 5: Copy data back
INSERT INTO user_data_old (key, value, user_email, timestamp, created_at, updated_at)
SELECT key, value, user_email, timestamp, created_at, updated_at
FROM user_data
WHERE user_email IS NOT NULL;

-- Step 6: Replace tables
DROP TABLE user_data;
ALTER TABLE user_data_old RENAME TO user_data;

-- Step 7: Recreate old indexes
CREATE INDEX IF NOT EXISTS idx_timestamp ON user_data(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_email ON user_data(user_email);

-- Step 8: Drop idx_user_id (it was created in UP)
DROP INDEX IF EXISTS idx_user_id;

