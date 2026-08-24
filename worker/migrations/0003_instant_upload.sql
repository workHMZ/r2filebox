-- Introduce content-addressed file blobs while preserving legacy file shares.
ALTER TABLE shares ADD COLUMN blob_id TEXT;

ALTER TABLE upload_sessions ADD COLUMN fingerprint_algorithm TEXT;
ALTER TABLE upload_sessions ADD COLUMN content_fingerprint TEXT;

CREATE TABLE file_blobs (
  id TEXT PRIMARY KEY NOT NULL,
  fingerprint_algorithm TEXT,
  content_fingerprint TEXT,
  r2_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  object_etag TEXT,
  object_uploaded_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'orphaned')),
  created_at TEXT NOT NULL,
  orphaned_at TEXT,
  CHECK(
    (fingerprint_algorithm IS NULL AND content_fingerprint IS NULL)
    OR (
      fingerprint_algorithm IS NOT NULL
      AND length(fingerprint_algorithm) > 0
      AND content_fingerprint IS NOT NULL
      AND length(content_fingerprint) > 0
    )
  ),
  CHECK(
    (status = 'orphaned' AND orphaned_at IS NOT NULL)
    OR (status != 'orphaned' AND orphaned_at IS NULL)
  )
);

-- Stale multipart sessions are moved here atomically before Cron touches R2.
-- This outbox makes completion and cleanup mutually exclusive at the D1
-- commit point while retaining the physical-byte reservation until R2 has
-- actually been reconciled.
CREATE TABLE upload_cleanup_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  upload_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  claimed_at TEXT NOT NULL
);

CREATE INDEX idx_shares_blob_id
ON shares(blob_id);

CREATE INDEX idx_upload_sessions_fingerprint
ON upload_sessions(fingerprint_algorithm, content_fingerprint)
WHERE fingerprint_algorithm IS NOT NULL
  AND content_fingerprint IS NOT NULL;

CREATE UNIQUE INDEX idx_file_blobs_active_fingerprint
ON file_blobs(fingerprint_algorithm, content_fingerprint, size_bytes)
WHERE status = 'active'
  AND fingerprint_algorithm IS NOT NULL
  AND content_fingerprint IS NOT NULL;

CREATE INDEX idx_file_blobs_status_created
ON file_blobs(status, created_at);

CREATE INDEX idx_file_blobs_status_orphaned
ON file_blobs(status, orphaned_at);

CREATE INDEX idx_upload_cleanup_jobs_claimed
ON upload_cleanup_jobs(claimed_at);

-- Existing active file shares each own an R2 object, so backfill them as
-- one-to-one legacy blobs without inventing an unverifiable fingerprint.
INSERT INTO file_blobs (
  id,
  fingerprint_algorithm,
  content_fingerprint,
  r2_key,
  size_bytes,
  object_etag,
  object_uploaded_at,
  status,
  created_at,
  orphaned_at
)
SELECT
  'legacy-' || id,
  NULL,
  NULL,
  r2_key,
  size_bytes,
  object_etag,
  object_uploaded_at,
  'active',
  COALESCE(object_uploaded_at, created_at),
  NULL
FROM shares
WHERE type = 'file'
  AND deleted_at IS NULL;

UPDATE shares
SET blob_id = (
  SELECT file_blobs.id
  FROM file_blobs
  WHERE file_blobs.r2_key = shares.r2_key
)
WHERE type = 'file'
  AND deleted_at IS NULL;

-- Storage usage now represents physical objects: active text-share objects,
-- every tracked file blob, and multipart-upload reservations.
DROP TRIGGER IF EXISTS storage_usage_shares_insert;
DROP TRIGGER IF EXISTS storage_usage_shares_update;
DROP TRIGGER IF EXISTS storage_usage_shares_delete;
DROP TRIGGER IF EXISTS storage_usage_uploads_insert;
DROP TRIGGER IF EXISTS storage_usage_uploads_update;
DROP TRIGGER IF EXISTS storage_usage_uploads_delete;

CREATE TRIGGER storage_usage_shares_insert
AFTER INSERT ON shares
WHEN NEW.type = 'text' AND NEW.deleted_at IS NULL
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes + NEW.size_bytes
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_shares_update
AFTER UPDATE OF type, deleted_at, size_bytes ON shares
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes
    - CASE
        WHEN OLD.type = 'text' AND OLD.deleted_at IS NULL
        THEN OLD.size_bytes ELSE 0
      END
    + CASE
        WHEN NEW.type = 'text' AND NEW.deleted_at IS NULL
        THEN NEW.size_bytes ELSE 0
      END
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_shares_delete
AFTER DELETE ON shares
WHEN OLD.type = 'text' AND OLD.deleted_at IS NULL
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

CREATE TRIGGER storage_usage_file_blobs_insert
AFTER INSERT ON file_blobs
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes + NEW.size_bytes
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_file_blobs_update
AFTER UPDATE OF size_bytes ON file_blobs
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes - OLD.size_bytes + NEW.size_bytes
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_file_blobs_delete
AFTER DELETE ON file_blobs
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes - OLD.size_bytes
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_upload_cleanup_insert
AFTER INSERT ON upload_cleanup_jobs
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes + NEW.size_bytes
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_upload_cleanup_update
AFTER UPDATE OF size_bytes ON upload_cleanup_jobs
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes - OLD.size_bytes + NEW.size_bytes
  WHERE id = 1;
END;

CREATE TRIGGER storage_usage_upload_cleanup_delete
AFTER DELETE ON upload_cleanup_jobs
BEGIN
  UPDATE storage_usage
  SET active_bytes = active_bytes - OLD.size_bytes
  WHERE id = 1;
END;

-- The migration is applied before the new Worker is deployed. During that
-- window, an old Worker may still complete an upload without setting blob_id.
-- Give that share a namespaced legacy blob and attach it atomically.
CREATE TRIGGER file_blobs_legacy_share_insert
AFTER INSERT ON shares
WHEN NEW.type = 'file'
  AND NEW.deleted_at IS NULL
  AND NEW.blob_id IS NULL
BEGIN
  INSERT INTO file_blobs (
    id,
    fingerprint_algorithm,
    content_fingerprint,
    r2_key,
    size_bytes,
    object_etag,
    object_uploaded_at,
    status,
    created_at,
    orphaned_at
  ) VALUES (
    'legacy-' || NEW.id,
    NULL,
    NULL,
    NEW.r2_key,
    NEW.size_bytes,
    NEW.object_etag,
    NEW.object_uploaded_at,
    'active',
    COALESCE(NEW.object_uploaded_at, NEW.created_at),
    NULL
  );

  UPDATE shares
  SET blob_id = 'legacy-' || NEW.id
  WHERE id = NEW.id
    AND blob_id IS NULL;
END;

-- Keep the blob row as an orphan outbox entry when an old Worker soft-deletes
-- the last active share during the migration-to-deployment window.
CREATE TRIGGER file_blobs_orphan_after_share_soft_delete
AFTER UPDATE OF deleted_at ON shares
WHEN OLD.type = 'file'
  AND OLD.deleted_at IS NULL
  AND NEW.deleted_at IS NOT NULL
  AND OLD.blob_id IS NOT NULL
BEGIN
  UPDATE file_blobs
  SET
    status = 'orphaned',
    orphaned_at = COALESCE(
      NULLIF(NEW.deleted_at, ''),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
  WHERE id = OLD.blob_id
    AND status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM shares
      WHERE shares.blob_id = OLD.blob_id
        AND shares.type = 'file'
        AND shares.deleted_at IS NULL
    );
END;

-- Hard deletion normally follows a soft delete, but this also repairs direct
-- legacy deletions without orphaning a blob that still has an active share.
CREATE TRIGGER file_blobs_orphan_after_share_delete
AFTER DELETE ON shares
WHEN OLD.type = 'file'
  AND OLD.blob_id IS NOT NULL
BEGIN
  UPDATE file_blobs
  SET
    status = 'orphaned',
    orphaned_at = COALESCE(
      NULLIF(OLD.deleted_at, ''),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
  WHERE id = OLD.blob_id
    AND status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM shares
      WHERE shares.blob_id = OLD.blob_id
        AND shares.type = 'file'
        AND shares.deleted_at IS NULL
    );
END;

INSERT INTO storage_usage (id, active_bytes)
SELECT
  1,
  COALESCE((
    SELECT SUM(size_bytes)
    FROM shares
    WHERE type = 'text' AND deleted_at IS NULL
  ), 0)
  + COALESCE((SELECT SUM(size_bytes) FROM file_blobs), 0)
  + COALESCE((SELECT SUM(size_bytes) FROM upload_sessions), 0)
  + COALESCE((SELECT SUM(size_bytes) FROM upload_cleanup_jobs), 0)
ON CONFLICT(id) DO UPDATE SET active_bytes = excluded.active_bytes;
