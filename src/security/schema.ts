export const SECURITY_SCHEMA = [
  'ALTER TABLE sessions ADD COLUMN verified_at INTEGER',
  'ALTER TABLE sessions ADD COLUMN credential_id TEXT',
  'ALTER TABLE users ADD COLUMN auth_handle TEXT',
  `CREATE TABLE passkeys (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL, counter INTEGER NOT NULL, name TEXT NOT NULL,
    device_type TEXT NOT NULL, backed_up INTEGER NOT NULL, transports TEXT NOT NULL,
    auth_nonce TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER
  )`,
  'CREATE INDEX passkeys_user ON passkeys (user_id)',
  `CREATE TABLE auth_grants (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('enroll', 'recover')), source TEXT NOT NULL DEFAULT 'admin',
    created_at INTEGER NOT NULL, created_by TEXT, approved_by TEXT, approved_at INTEGER, approval_evidence TEXT, evidence TEXT,
    expires_at INTEGER NOT NULL, revoked_at INTEGER, used_at INTEGER, used_by TEXT
  )`,
  'CREATE INDEX auth_grants_user ON auth_grants (user_id, expires_at)',
  'CREATE TABLE auth_bootstrap (id INTEGER PRIMARY KEY CHECK (id = 1), user_id TEXT NOT NULL, used_at INTEGER NOT NULL)',
  `CREATE TABLE auth_challenges (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('register', 'authenticate')),
    challenge TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER,
    grant_id TEXT, next_path TEXT NOT NULL
  )`,
  'CREATE INDEX auth_challenges_expiry ON auth_challenges (expires_at)',
  `CREATE TRIGGER passkeys_revoke_sessions AFTER DELETE ON passkeys BEGIN
    UPDATE sessions SET verified_at = NULL, credential_id = NULL WHERE user_id = OLD.user_id; END`,
]
