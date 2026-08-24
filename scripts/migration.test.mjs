import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

const migrationSql = (name) => readFileSync(
  new URL(`../worker/migrations/${name}`, import.meta.url),
  'utf8',
)

test('0003 migrates 2.4 data to physical blob accounting and keeps old Workers compatible', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(migrationSql('0001_init.sql'))
    db.exec(migrationSql('0002_reliability.sql'))

    const now = '2026-08-24T00:00:00.000Z'
    const future = '2026-08-25T00:00:00.000Z'
    const insertShare = db.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes,
        created_at, expire_at, deleted_at, max_downloads, download_count,
        object_etag, object_uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10, 0, ?, ?)
    `)
    insertShare.run(
      'file-active', 'code-file-active', 'file', 'objects/file-active',
      'active.mov', 'video/quicktime', 10, now, future, null, 'etag-file', now,
    )
    insertShare.run(
      'text-active', 'code-text-active', 'text', 'objects/text-active',
      'text.txt', 'text/plain', 4, now, future, null, 'etag-text', now,
    )
    insertShare.run(
      'file-deleted', 'code-file-deleted', 'file', 'objects/file-deleted',
      'deleted.bin', 'application/octet-stream', 7, now, future, now, 'etag-deleted', now,
    )
    db.prepare(`
      INSERT INTO upload_sessions (
        id, share_id, upload_id, code_hash, r2_key, display_name, mime_type,
        size_bytes, expire_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'upload-active', 'upload-share', 'r2-upload', 'code-upload',
      'objects/upload', 'upload.bin', 'application/octet-stream', 3,
      future, now, now,
    )

    assert.equal(db.prepare('SELECT active_bytes FROM storage_usage WHERE id = 1').get().active_bytes, 17)
    db.exec(migrationSql('0003_instant_upload.sql'))

    const migrated = db.prepare(`
      SELECT shares.blob_id, blobs.r2_key, blobs.status, blobs.fingerprint_algorithm
      FROM shares
      JOIN file_blobs AS blobs ON blobs.id = shares.blob_id
      WHERE shares.id = 'file-active'
    `).get()
    assert.deepEqual({ ...migrated }, {
      blob_id: 'legacy-file-active',
      r2_key: 'objects/file-active',
      status: 'active',
      fingerprint_algorithm: null,
    })
    assert.equal(
      db.prepare("SELECT blob_id FROM shares WHERE id = 'file-deleted'").get().blob_id,
      null,
    )
    assert.equal(db.prepare('SELECT active_bytes FROM storage_usage WHERE id = 1').get().active_bytes, 17)

    // Migration-first deployment compatibility: a 2.4 Worker omits blob_id,
    // but the trigger creates and attaches a legacy physical blob atomically.
    insertShare.run(
      'file-old-worker', 'code-file-old-worker', 'file', 'objects/file-old-worker',
      'old-worker.bin', 'application/octet-stream', 5, now, future, null, 'etag-old', now,
    )
    assert.deepEqual(
      { ...db.prepare(`
        SELECT shares.blob_id, blobs.status
        FROM shares JOIN file_blobs AS blobs ON blobs.id = shares.blob_id
        WHERE shares.id = 'file-old-worker'
      `).get() },
      { blob_id: 'legacy-file-old-worker', status: 'active' },
    )
    assert.equal(db.prepare('SELECT active_bytes FROM storage_usage WHERE id = 1').get().active_bytes, 22)

    db.prepare("UPDATE shares SET deleted_at = ? WHERE id = 'file-active'").run(now)
    assert.equal(
      db.prepare("SELECT status FROM file_blobs WHERE id = 'legacy-file-active'").get().status,
      'orphaned',
    )
    assert.equal(db.prepare('SELECT active_bytes FROM storage_usage WHERE id = 1').get().active_bytes, 22)
    db.prepare("DELETE FROM file_blobs WHERE id = 'legacy-file-active'").run()
    assert.equal(db.prepare('SELECT active_bytes FROM storage_usage WHERE id = 1').get().active_bytes, 12)
  } finally {
    db.close()
  }
})
