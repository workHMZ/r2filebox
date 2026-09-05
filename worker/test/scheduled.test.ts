import { createScheduledController, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker, { requireSuccessfulCleanup } from '../src/index'
import { cleanupExpiredShares } from '../src/lib/cleanup'
import type { Env } from '../src/types'

describe('scheduled cleanup reporting', () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL, r2_key TEXT NOT NULL, display_name TEXT,
        mime_type TEXT, size_bytes INTEGER NOT NULL, title TEXT,
        created_at TEXT NOT NULL, expire_at TEXT NOT NULL, deleted_at TEXT,
        max_downloads INTEGER, download_count INTEGER NOT NULL,
        created_ip_hash TEXT, last_access_at TEXT, object_etag TEXT,
        object_uploaded_at TEXT, blob_id TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY, share_id TEXT NOT NULL UNIQUE,
        upload_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE,
        r2_key TEXT NOT NULL, display_name TEXT NOT NULL, mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL, title TEXT, expire_at TEXT NOT NULL,
        max_downloads INTEGER, created_ip_hash TEXT, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS abuse_counters (
        key TEXT PRIMARY KEY, action TEXT NOT NULL, ip_hash TEXT NOT NULL,
        bucket_start TEXT NOT NULL, count INTEGER NOT NULL, updated_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY, action TEXT NOT NULL, share_id TEXT,
        subject_type TEXT, subject_name TEXT, size_bytes INTEGER,
        ip_hash TEXT, user_agent_hash TEXT, status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS file_blobs (
        id TEXT PRIMARY KEY,
        fingerprint_algorithm TEXT,
        content_fingerprint TEXT,
        r2_key TEXT NOT NULL UNIQUE,
        size_bytes INTEGER NOT NULL,
        object_etag TEXT,
        object_uploaded_at TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        orphaned_at TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS upload_cleanup_jobs (
        id TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL,
        r2_key TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        claimed_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_scheduled_orphan_after_share_soft_delete
        AFTER UPDATE OF deleted_at ON shares
        WHEN OLD.type = 'file'
          AND OLD.deleted_at IS NULL
          AND NEW.deleted_at IS NOT NULL
          AND OLD.blob_id IS NOT NULL
        BEGIN
          UPDATE file_blobs
          SET status = 'orphaned', orphaned_at = NEW.deleted_at
          WHERE id = OLD.blob_id
            AND status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM shares
              WHERE shares.blob_id = OLD.blob_id
                AND shares.deleted_at IS NULL
            );
        END`),
    ])
  })

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM shares'),
      env.DB.prepare('DELETE FROM upload_sessions'),
      env.DB.prepare('DELETE FROM upload_cleanup_jobs'),
      env.DB.prepare('DELETE FROM file_blobs'),
      env.DB.prepare('DELETE FROM abuse_counters'),
      env.DB.prepare('DELETE FROM audit_logs'),
    ])
  })

  it('throws when cleanup reports partial failures', () => {
    expect(() => requireSuccessfulCleanup({ failures: 2 })).toThrow(
      'Scheduled cleanup completed with 2 failed operation(s)',
    )
    expect(() => requireSuccessfulCleanup({ failures: 0 })).not.toThrow()
  })

  it('propagates an unexpected cleanup rejection to the scheduler', async () => {
    const failingEnv = {
      BUCKET: env.BUCKET,
      DB: {
        prepare() {
          throw new Error('D1 unavailable')
        },
      },
    } as unknown as Env

    await expect(worker.scheduled(createScheduledController(), failingEnv)).rejects.toThrow('D1 unavailable')
  })

  it('retains a failed orphan deletion and retries it on the next cleanup', async () => {
    const blobId = crypto.randomUUID()
    const key = `scheduled-orphan/${blobId}`
    const now = new Date().toISOString()
    await env.BUCKET.put(key, 'orphan')
    await env.DB.prepare(`
      INSERT INTO file_blobs (
        id, fingerprint_algorithm, content_fingerprint, r2_key, size_bytes,
        object_etag, object_uploaded_at, status, created_at, orphaned_at
      ) VALUES (?, 'sha256-tree-v1', ?, ?, 6, NULL, ?, 'orphaned', ?, ?)
    `).bind(blobId, crypto.randomUUID(), key, now, now, now).run()

    const failingBucket = {
      async delete() {
        throw new Error('R2 unavailable')
      },
    } as unknown as R2Bucket
    const failed = await cleanupExpiredShares(env.DB, failingBucket, 100)

    expect(failed.failures).toBe(1)
    expect(failed.deletedR2).toBe(0)
    await expect(env.DB.prepare('SELECT status FROM file_blobs WHERE id = ?')
      .bind(blobId)
      .first<{ status: string }>()).resolves.toEqual({ status: 'orphaned' })
    expect(await env.BUCKET.head(key)).not.toBeNull()

    const retried = await cleanupExpiredShares(env.DB, env.BUCKET, 100)
    expect(retried.failures).toBe(0)
    expect(retried.deletedR2).toBe(1)
    expect(await env.BUCKET.head(key)).toBeNull()
    await expect(env.DB.prepare('SELECT id FROM file_blobs WHERE id = ?')
      .bind(blobId)
      .first()).resolves.toBeNull()
  })

  it('expires a managed share without deleting a blob that still has an active reference', async () => {
    const blobId = crypto.randomUUID()
    const key = `scheduled-shared/${blobId}`
    const now = new Date().toISOString()
    await env.BUCKET.put(key, 'shared')
    await env.DB.prepare(`
      INSERT INTO file_blobs (
        id, fingerprint_algorithm, content_fingerprint, r2_key, size_bytes,
        object_etag, object_uploaded_at, status, created_at, orphaned_at
      ) VALUES (?, 'sha256-tree-v1', ?, ?, 6, NULL, ?, 'active', ?, NULL)
    `).bind(blobId, crypto.randomUUID(), key, now, now).run()
    await insertManagedShare(crypto.randomUUID(), blobId, key, new Date(Date.now() - 60_000).toISOString())
    const activeShareId = crypto.randomUUID()
    await insertManagedShare(activeShareId, blobId, key, new Date(Date.now() + 60_000).toISOString())

    const result = await cleanupExpiredShares(env.DB, env.BUCKET, 100)

    expect(result.failures).toBe(0)
    expect(result.processed).toBe(1)
    expect(result.deletedR2).toBe(0)
    expect(await env.BUCKET.head(key)).not.toBeNull()
    await expect(env.DB.prepare('SELECT status FROM file_blobs WHERE id = ?')
      .bind(blobId)
      .first<{ status: string }>()).resolves.toEqual({ status: 'active' })
    await expect(env.DB.prepare('SELECT deleted_at FROM shares WHERE id = ?')
      .bind(activeShareId)
      .first<{ deleted_at: string | null }>()).resolves.toEqual({ deleted_at: null })
  })

  it('deletes a completed object that is still tracked only by a stale upload session', async () => {
    const sessionId = crypto.randomUUID()
    const key = `scheduled-completed/${sessionId}`
    await env.BUCKET.put(key, 'completed but not committed')
    await insertUploadSession(sessionId, crypto.randomUUID(), key)

    const result = await cleanupExpiredShares(env.DB, env.BUCKET, 100)

    expect(result.failures).toBe(0)
    expect(result.deletedR2).toBe(1)
    expect(await env.BUCKET.head(key)).toBeNull()
    await expect(env.DB.prepare('SELECT id FROM upload_sessions WHERE id = ?')
      .bind(sessionId)
      .first()).resolves.toBeNull()
  })

  it('keeps an object referenced by another active share while removing its stale reservation', async () => {
    const sessionId = crypto.randomUUID()
    const key = `scheduled-referenced/${sessionId}`
    await env.BUCKET.put(key, 'still referenced')
    await insertUploadSession(sessionId, crypto.randomUUID(), key)
    await insertManagedShare(
      crypto.randomUUID(),
      crypto.randomUUID(),
      key,
      new Date(Date.now() + 60_000).toISOString(),
    )

    const result = await cleanupExpiredShares(env.DB, env.BUCKET, 100)

    expect(result.failures).toBe(0)
    expect(result.deletedR2).toBe(0)
    expect(await env.BUCKET.head(key)).not.toBeNull()
    await expect(env.DB.prepare('SELECT id FROM upload_sessions WHERE id = ?')
      .bind(sessionId)
      .first()).resolves.toBeNull()
  })

  it('expires a managed share and its completed stale session in the same cleanup run', async () => {
    const sessionId = crypto.randomUUID()
    const blobId = crypto.randomUUID()
    const key = `scheduled-expired-completed/${sessionId}`
    const now = new Date().toISOString()
    await env.BUCKET.put(key, 'expired completed upload')
    await env.DB.prepare(`
      INSERT INTO file_blobs (
        id, fingerprint_algorithm, content_fingerprint, r2_key, size_bytes,
        object_etag, object_uploaded_at, status, created_at, orphaned_at
      ) VALUES (?, 'sha256-tree-v1', ?, ?, 24, NULL, ?, 'active', ?, NULL)
    `).bind(blobId, crypto.randomUUID(), key, now, now).run()
    await insertManagedShare(
      crypto.randomUUID(),
      blobId,
      key,
      new Date(Date.now() - 60_000).toISOString(),
    )
    await insertUploadSession(sessionId, crypto.randomUUID(), key)

    const result = await cleanupExpiredShares(env.DB, env.BUCKET, 100)

    expect(result.failures).toBe(0)
    expect(result.processed).toBe(1)
    expect(result.deletedR2).toBe(1)
    expect(await env.BUCKET.head(key)).toBeNull()
    await expect(env.DB.prepare('SELECT id FROM upload_sessions WHERE id = ?')
      .bind(sessionId)
      .first()).resolves.toBeNull()
    await expect(env.DB.prepare('SELECT id FROM file_blobs WHERE id = ?')
      .bind(blobId)
      .first()).resolves.toBeNull()
  })

  it('drains an expired-share backlog larger than one batch in a single run', async () => {
    // Three passes is the Free-plan default, so this is exactly what one hourly
    // Cron run reclaims. A larger backlog is left for the next hour by design.
    const backlog = 250
    const expired = new Date(Date.now() - 60_000).toISOString()
    const now = new Date().toISOString()
    const inserts = Array.from({ length: backlog }, () => env.DB.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes,
        title, created_at, expire_at, deleted_at, max_downloads,
        download_count, created_ip_hash, last_access_at, object_etag,
        object_uploaded_at, blob_id
      ) VALUES (?, ?, 'text', ?, 'text.txt', 'text/plain', 4,
        NULL, ?, ?, NULL, 10, 0, NULL, NULL, NULL, ?, NULL)
    `).bind(
      crypto.randomUUID(),
      crypto.randomUUID(),
      `scheduled-backlog/${crypto.randomUUID()}`,
      now,
      expired,
      now,
    ))
    for (let offset = 0; offset < inserts.length; offset += 50) {
      await env.DB.batch(inserts.slice(offset, offset + 50))
    }

    const result = await cleanupExpiredShares(env.DB, env.BUCKET, 100)

    expect(result.failures).toBe(0)
    expect(result.processed).toBe(backlog)
    await expect(env.DB.prepare(`
      SELECT count(*) AS remaining FROM shares
      WHERE deleted_at IS NULL AND expire_at < ?
    `).bind(new Date().toISOString()).first<{ remaining: number }>())
      .resolves.toEqual({ remaining: 0 })
  })

  it('stops after one pass when the caller limits it to a single batch', async () => {
    const backlog = 150
    const expired = new Date(Date.now() - 60_000).toISOString()
    const now = new Date().toISOString()
    const inserts = Array.from({ length: backlog }, () => env.DB.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes,
        title, created_at, expire_at, deleted_at, max_downloads,
        download_count, created_ip_hash, last_access_at, object_etag,
        object_uploaded_at, blob_id
      ) VALUES (?, ?, 'text', ?, 'text.txt', 'text/plain', 4,
        NULL, ?, ?, NULL, 10, 0, NULL, NULL, NULL, ?, NULL)
    `).bind(
      crypto.randomUUID(),
      crypto.randomUUID(),
      `scheduled-single/${crypto.randomUUID()}`,
      now,
      expired,
      now,
    ))
    for (let offset = 0; offset < inserts.length; offset += 50) {
      await env.DB.batch(inserts.slice(offset, offset + 50))
    }

    const result = await cleanupExpiredShares(env.DB, env.BUCKET, 100, { maxPasses: 1 })

    expect(result.processed).toBe(100)
    // The rest stays queued rather than extending one invocation past its
    // CPU budget; the next scheduled run picks it up.
    await expect(env.DB.prepare(`
      SELECT count(*) AS remaining FROM shares
      WHERE deleted_at IS NULL AND expire_at < ?
    `).bind(new Date().toISOString()).first<{ remaining: number }>())
      .resolves.toEqual({ remaining: backlog - 100 })
  })
})

async function insertManagedShare(
  id: string,
  blobId: string,
  r2Key: string,
  expireAt: string,
): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO shares (
      id, code_hash, type, r2_key, display_name, mime_type, size_bytes,
      title, created_at, expire_at, deleted_at, max_downloads,
      download_count, created_ip_hash, last_access_at, object_etag,
      object_uploaded_at, blob_id
    ) VALUES (?, ?, 'file', ?, 'shared.bin', 'application/octet-stream', 6,
      NULL, ?, ?, NULL, 10, 0, NULL, NULL, NULL, ?, ?)
  `).bind(id, crypto.randomUUID(), r2Key, now, expireAt, now, blobId).run()
}

async function insertUploadSession(id: string, shareId: string, r2Key: string): Promise<void> {
  const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  await env.DB.prepare(`
    INSERT INTO upload_sessions (
      id, share_id, upload_id, code_hash, r2_key, display_name, mime_type,
      size_bytes, title, expire_at, max_downloads, created_ip_hash,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'stale.bin', 'application/octet-stream',
      21, NULL, ?, 10, NULL, ?, ?)
  `).bind(
    id,
    shareId,
    crypto.randomUUID(),
    crypto.randomUUID(),
    r2Key,
    stale,
    stale,
    stale,
  ).run()
}
