-- Preserve audit details after the related share or upload session is removed.
ALTER TABLE audit_logs ADD COLUMN subject_type TEXT;
ALTER TABLE audit_logs ADD COLUMN subject_name TEXT;
ALTER TABLE audit_logs ADD COLUMN size_bytes INTEGER;

-- The limiter no longer uses KV. Rename the old administrator setting while
-- preserving its value for existing installations.
INSERT INTO settings (key, value, updated_at)
SELECT 'ENABLE_NATIVE_RATE_LIMIT', value, updated_at
FROM settings
WHERE key = 'ENABLE_KV_RATE_LIMIT'
ON CONFLICT(key) DO NOTHING;

DELETE FROM settings WHERE key = 'ENABLE_KV_RATE_LIMIT';

-- Repair the completion window used by older versions: once the active share
-- exists with the same object and code hash, the upload reservation is stale.
DELETE FROM upload_sessions
WHERE EXISTS (
  SELECT 1
  FROM shares
  WHERE shares.id = upload_sessions.share_id
    AND shares.r2_key = upload_sessions.r2_key
    AND shares.code_hash = upload_sessions.code_hash
    AND shares.deleted_at IS NULL
);

-- Keep the hot-path storage quota check O(1). The triggers make this row the
-- authoritative total for active shares plus reserved multipart uploads.
CREATE TABLE storage_usage (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_bytes INTEGER NOT NULL DEFAULT 0
);

INSERT INTO storage_usage (id, active_bytes)
SELECT
  1,
  COALESCE((SELECT SUM(size_bytes) FROM shares WHERE deleted_at IS NULL), 0) +
  COALESCE((SELECT SUM(size_bytes) FROM upload_sessions), 0);

CREATE TRIGGER storage_usage_shares_insert
AFTER INSERT ON shares
WHEN NEW.deleted_at IS NULL
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes + NEW.size_bytes
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_shares_update
AFTER UPDATE OF deleted_at, size_bytes ON shares
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes
    - CASE WHEN OLD.deleted_at IS NULL THEN OLD.size_bytes ELSE 0 END
    + CASE WHEN NEW.deleted_at IS NULL THEN NEW.size_bytes ELSE 0 END
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_shares_delete
AFTER DELETE ON shares
WHEN OLD.deleted_at IS NULL
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes - OLD.size_bytes
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_uploads_insert
AFTER INSERT ON upload_sessions
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes + NEW.size_bytes
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_uploads_update
AFTER UPDATE OF size_bytes ON upload_sessions
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes - OLD.size_bytes + NEW.size_bytes
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_uploads_delete
AFTER DELETE ON upload_sessions
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes - OLD.size_bytes
  WHERE id = 1;
END;

-- Match the filters and ordering used by the admin list, expiry cleanup, abuse
-- cleanup, and audit log list. Keep the original indexes for old deployments.
CREATE INDEX idx_shares_deleted_created
ON shares(deleted_at, created_at DESC);

CREATE INDEX idx_shares_deleted_expire
ON shares(deleted_at, expire_at);

CREATE INDEX idx_abuse_counters_updated_at
ON abuse_counters(updated_at);

CREATE INDEX idx_audit_logs_created_id
ON audit_logs(created_at DESC, id DESC);
