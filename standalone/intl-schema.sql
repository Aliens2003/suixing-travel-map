CREATE TABLE IF NOT EXISTS intl_travel_states(user_id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS intl_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,recovery_hash TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS intl_session_expiry ON intl_sessions(expires_at);
CREATE TABLE IF NOT EXISTS intl_auth_limits(rate_key TEXT PRIMARY KEY,bucket INTEGER NOT NULL,attempts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS intl_map_limits(user_id TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL);
