import { env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DB } from '../src/lib/db'
import type { FileBlob, Share, UploadSession } from '../src/types'

const fingerprintAlgorithm = 'sha256-tree-v1'
const fingerprintA = 'a'.repeat(64)
const fingerprintB = 'b'.repeat(64)

describe('storage accounting with D1 triggers', () => {
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
        updated_at TEXT NOT NULL, fingerprint_algorithm TEXT,
        content_fingerprint TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS file_blobs (
        id TEXT PRIMARY KEY,
        fingerprint_algorithm TEXT,
        content_fingerprint TEXT,
        r2_key TEXT NOT NULL UNIQUE,
        size_bytes INTEGER NOT NULL,
        object_etag TEXT,
        object_uploaded_at TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'orphaned')),
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
      env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS test_active_blob_fingerprint
        ON file_blobs(fingerprint_algorithm, content_fingerprint, size_bytes)
        WHERE status = 'active'
          AND fingerprint_algorithm IS NOT NULL
          AND content_fingerprint IS NOT NULL`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_usage (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_bytes INTEGER NOT NULL DEFAULT 0
      )`),
      env.DB.prepare('INSERT OR IGNORE INTO storage_usage (id, active_bytes) VALUES (1, 0)'),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_text_shares_insert
        AFTER INSERT ON shares
        WHEN NEW.type = 'text' AND NEW.deleted_at IS NULL BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_text_shares_update
        AFTER UPDATE OF type, deleted_at, size_bytes ON shares BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes
            - CASE WHEN OLD.type = 'text' AND OLD.deleted_at IS NULL THEN OLD.size_bytes ELSE 0 END
            + CASE WHEN NEW.type = 'text' AND NEW.deleted_at IS NULL THEN NEW.size_bytes ELSE 0 END
          WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_text_shares_delete
        AFTER DELETE ON shares
        WHEN OLD.type = 'text' AND OLD.deleted_at IS NULL BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_uploads_insert
        AFTER INSERT ON upload_sessions BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_uploads_update
        AFTER UPDATE OF size_bytes ON upload_sessions BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_uploads_delete
        AFTER DELETE ON upload_sessions BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_blobs_insert
        AFTER INSERT ON file_blobs BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_blobs_update
        AFTER UPDATE OF size_bytes ON file_blobs BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_blobs_delete
        AFTER DELETE ON file_blobs BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_orphan_blob_after_share_update
        AFTER UPDATE OF deleted_at ON shares
        WHEN OLD.type = 'file'
          AND OLD.deleted_at IS NULL
          AND NEW.deleted_at IS NOT NULL
          AND OLD.blob_id IS NOT NULL BEGIN
          UPDATE file_blobs
          SET status = 'orphaned', orphaned_at = NEW.deleted_at
          WHERE id = OLD.blob_id
            AND status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM shares
              WHERE shares.blob_id = OLD.blob_id
                AND shares.type = 'file'
                AND shares.deleted_at IS NULL
            );
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_orphan_blob_after_share_delete
        AFTER DELETE ON shares
        WHEN OLD.type = 'file' AND OLD.blob_id IS NOT NULL BEGIN
          UPDATE file_blobs
          SET status = 'orphaned', orphaned_at = COALESCE(OLD.deleted_at, datetime('now'))
          WHERE id = OLD.blob_id
            AND status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM shares
              WHERE shares.blob_id = OLD.blob_id
                AND shares.type = 'file'
                AND shares.deleted_at IS NULL
            );
        END`),
    ])
  })

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM shares').run()
    await env.DB.prepare('DELETE FROM upload_sessions').run()
    await env.DB.prepare('DELETE FROM upload_cleanup_jobs').run()
    await env.DB.prepare('DELETE FROM file_blobs').run()
    await env.DB.prepare('UPDATE storage_usage SET active_bytes = 0 WHERE id = 1').run()
  })

  it('counts an active text object without relying on trigger-inflated changes', async () => {
    const db = new DB(env.DB)
    const share = makeTextShare(41)

    await expect(db.createShare(share, 100)).resolves.toBe(true)
    await expect(activeBytes()).resolves.toBe(41)
    await expect(db.markSharesDeletedByIds([share.id], new Date().toISOString())).resolves.toBe(1)
    await expect(activeBytes()).resolves.toBe(0)
  })

  it('replaces a multipart reservation with its verified winner blob at net zero bytes', async () => {
    const db = new DB(env.DB)
    const session = makeSession(73, fingerprintA)
    const share = makeFileShare(73, session.share_id, session.code_hash, session.r2_key)
    const candidate = makeBlob(73, crypto.randomUUID(), session.r2_key, fingerprintA, 'pending')

    await expect(db.createUploadSession(session, 100)).resolves.toBe(true)
    await expect(activeBytes()).resolves.toBe(73)
    await expect(db.getSystemStats()).resolves.toMatchObject({ total_size: 73 })

    const completion = await db.completeVerifiedUploadSession(share, session, candidate)

    expect(completion.candidateOrphaned).toBe(false)
    expect(completion.blob).toMatchObject({ id: candidate.id, status: 'active' })
    expect(completion.share).toMatchObject({ id: share.id, blob_id: candidate.id })
    await expect(db.getUploadSession(session.id)).resolves.toBeNull()
    await expect(activeBytes()).resolves.toBe(73)
    await expect(db.getSystemStats()).resolves.toMatchObject({ total_size: 73 })
  })

  it('does not add bytes for instant shares and removes bytes only with the orphan row', async () => {
    const db = new DB(env.DB)
    const blob = makeBlob(61, crypto.randomUUID(), crypto.randomUUID(), fingerprintA)
    await insertBlob(blob)
    await expect(activeBytes()).resolves.toBe(61)

    const first = makeFileShare(61, crypto.randomUUID(), crypto.randomUUID(), blob.r2_key)
    const second = makeFileShare(61, crypto.randomUUID(), crypto.randomUUID(), blob.r2_key)
    const firstCreated = await db.createInstantFileShare(
      first,
      blob.id,
      fingerprintAlgorithm,
      fingerprintA,
    )
    const secondCreated = await db.createInstantFileShare(
      second,
      blob.id,
      fingerprintAlgorithm,
      fingerprintA,
    )

    expect(firstCreated?.blob_id).toBe(blob.id)
    expect(secondCreated?.blob_id).toBe(blob.id)
    await expect(activeBytes()).resolves.toBe(61)

    await db.markSharesDeletedByIds([first.id], new Date().toISOString())
    await expect(db.getFileBlobById(blob.id)).resolves.toMatchObject({ status: 'active' })
    await expect(activeBytes()).resolves.toBe(61)

    await db.markSharesDeletedByIds([second.id], new Date().toISOString())
    await expect(db.getFileBlobById(blob.id)).resolves.toMatchObject({ status: 'orphaned' })
    await expect(activeBytes()).resolves.toBe(61)

    await expect(db.deleteOrphanedFileBlob(blob.id)).resolves.toBe(true)
    await expect(activeBytes()).resolves.toBe(0)
  })

  it('keeps a losing verified candidate charged until its orphan outbox row is deleted', async () => {
    const db = new DB(env.DB)
    const winner = makeBlob(73, crypto.randomUUID(), crypto.randomUUID(), fingerprintB)
    await insertBlob(winner)

    const session = makeSession(73, fingerprintB)
    const share = makeFileShare(73, session.share_id, session.code_hash, session.r2_key)
    const candidate = makeBlob(73, crypto.randomUUID(), session.r2_key, fingerprintB, 'pending')
    await expect(db.createUploadSession(session, 200)).resolves.toBe(true)
    await expect(activeBytes()).resolves.toBe(146)

    const completion = await db.completeVerifiedUploadSession(share, session, candidate)

    expect(completion.candidateOrphaned).toBe(true)
    expect(completion.blob.id).toBe(winner.id)
    expect(completion.share.blob_id).toBe(winner.id)
    await expect(db.getFileBlobById(candidate.id)).resolves.toMatchObject({ status: 'orphaned' })
    await expect(activeBytes()).resolves.toBe(146)

    await expect(db.deleteOrphanedFileBlob(candidate.id)).resolves.toBe(true)
    await expect(activeBytes()).resolves.toBe(73)
  })

  it('rejects a reservation that exceeds the configured physical storage cap', async () => {
    const db = new DB(env.DB)

    await expect(db.createUploadSession(makeSession(101, fingerprintA), 100)).resolves.toBe(false)
    await expect(activeBytes()).resolves.toBe(0)
  })
})

function makeTextShare(size: number): Share {
  const share = makeFileShare(size)
  return {
    ...share,
    type: 'text',
    display_name: 'text.txt',
    mime_type: 'text/plain; charset=utf-8',
  }
}

function makeFileShare(
  size: number,
  id = crypto.randomUUID(),
  codeHash = crypto.randomUUID(),
  r2Key = crypto.randomUUID(),
): Share {
  const now = new Date().toISOString()
  return {
    id,
    code_hash: codeHash,
    type: 'file',
    r2_key: r2Key,
    display_name: 'test.bin',
    mime_type: 'application/octet-stream',
    size_bytes: size,
    title: null,
    created_at: now,
    expire_at: new Date(Date.now() + 60_000).toISOString(),
    deleted_at: null,
    max_downloads: 1,
    download_count: 0,
    created_ip_hash: null,
    last_access_at: null,
    object_etag: 'etag',
    object_uploaded_at: now,
    blob_id: null,
  }
}

function makeSession(size: number, fingerprint: string): UploadSession {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    share_id: crypto.randomUUID(),
    upload_id: crypto.randomUUID(),
    code_hash: crypto.randomUUID(),
    r2_key: crypto.randomUUID(),
    display_name: 'test.bin',
    mime_type: 'application/octet-stream',
    size_bytes: size,
    title: null,
    expire_at: new Date(Date.now() + 60_000).toISOString(),
    max_downloads: 1,
    created_ip_hash: null,
    created_at: now,
    updated_at: now,
    fingerprint_algorithm: fingerprintAlgorithm,
    content_fingerprint: fingerprint,
  }
}

function makeBlob(
  size: number,
  id: string,
  r2Key: string,
  fingerprint: string,
  status: FileBlob['status'] = 'active',
): FileBlob {
  const now = new Date().toISOString()
  return {
    id,
    fingerprint_algorithm: fingerprintAlgorithm,
    content_fingerprint: fingerprint,
    r2_key: r2Key,
    size_bytes: size,
    object_etag: 'etag',
    object_uploaded_at: now,
    status,
    created_at: now,
    orphaned_at: status === 'orphaned' ? now : null,
  }
}

async function insertBlob(blob: FileBlob): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO file_blobs (
      id, fingerprint_algorithm, content_fingerprint, r2_key, size_bytes,
      object_etag, object_uploaded_at, status, created_at, orphaned_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    blob.id,
    blob.fingerprint_algorithm,
    blob.content_fingerprint,
    blob.r2_key,
    blob.size_bytes,
    blob.object_etag,
    blob.object_uploaded_at,
    blob.status,
    blob.created_at,
    blob.orphaned_at,
  ).run()
}

async function activeBytes(): Promise<number> {
  const row = await env.DB.prepare('SELECT active_bytes FROM storage_usage WHERE id = 1')
    .first<{ active_bytes: number }>()
  return row?.active_bytes ?? -1
}
