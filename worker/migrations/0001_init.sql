CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('text','file')),
  r2_key TEXT NOT NULL,
  display_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  created_at TEXT NOT NULL,
  expire_at TEXT NOT NULL,
  deleted_at TEXT,
  max_downloads INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_ip_hash TEXT,
  last_access_at TEXT,
  object_etag TEXT,
  object_uploaded_at TEXT
);

CREATE TABLE abuse_counters (
  key TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  bucket_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL UNIQUE,
  upload_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  r2_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  title TEXT,
  expire_at TEXT NOT NULL,
  max_downloads INTEGER,
  created_ip_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  share_id TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_shares_expire_at ON shares(expire_at);
CREATE INDEX idx_shares_deleted_at ON shares(deleted_at);
CREATE INDEX idx_shares_created_at ON shares(created_at);
CREATE INDEX idx_upload_sessions_expire_at ON upload_sessions(expire_at);
CREATE INDEX idx_upload_sessions_created_at ON upload_sessions(created_at);
CREATE INDEX idx_abuse_counters_bucket ON abuse_counters(action, ip_hash, bucket_start);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
