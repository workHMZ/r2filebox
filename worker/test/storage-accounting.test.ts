import { env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DB } from '../src/lib/db'
import type { Share, UploadSession } from '../src/types'

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
        object_uploaded_at TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY, share_id TEXT NOT NULL UNIQUE,
        upload_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE,
        r2_key TEXT NOT NULL, display_name TEXT NOT NULL, mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL, title TEXT, expire_at TEXT NOT NULL,
        max_downloads INTEGER, created_ip_hash TEXT, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_usage (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_bytes INTEGER NOT NULL DEFAULT 0
      )`),
      env.DB.prepare('INSERT OR IGNORE INTO storage_usage (id, active_bytes) VALUES (1, 0)'),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_shares_insert
        AFTER INSERT ON shares WHEN NEW.deleted_at IS NULL BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_shares_update
        AFTER UPDATE OF deleted_at, size_bytes ON shares BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes
            - CASE WHEN OLD.deleted_at IS NULL THEN OLD.size_bytes ELSE 0 END
            + CASE WHEN NEW.deleted_at IS NULL THEN NEW.size_bytes ELSE 0 END
          WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_uploads_insert
        AFTER INSERT ON upload_sessions BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_storage_uploads_delete
        AFTER DELETE ON upload_sessions BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes WHERE id = 1;
        END`),
    ])
  })

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM shares').run()
    await env.DB.prepare('DELETE FROM upload_sessions').run()
    await env.DB.prepare('UPDATE storage_usage SET active_bytes = 0 WHERE id = 1').run()
  })

  it('detects a successful share insert without relying on trigger-inflated changes', async () => {
    const db = new DB(env.DB)
    const share = makeShare(41)

    await expect(db.createShare(share, 100)).resolves.toBe(true)
    await expect(activeBytes()).resolves.toBe(41)
    await expect(db.markSharesDeletedByIds([share.id], new Date().toISOString())).resolves.toBe(1)
    await expect(activeBytes()).resolves.toBe(0)
  })

  it('keeps a multipart reservation constant when it becomes a share', async () => {
    const db = new DB(env.DB)
    const session = makeSession(73)
    const share = makeShare(73, session.share_id, session.code_hash, session.r2_key)

    await expect(db.createUploadSession(session, 100)).resolves.toBe(true)
    await expect(activeBytes()).resolves.toBe(73)
    await expect(db.completeUploadSession(share, session)).resolves.toBeUndefined()
    await expect(activeBytes()).resolves.toBe(73)
    await expect(db.getShareById(share.id)).resolves.toMatchObject({ id: share.id })
    await expect(db.getUploadSession(session.id)).resolves.toBeNull()
  })

  it('rejects a reservation that exceeds the configured storage cap', async () => {
    const db = new DB(env.DB)

    await expect(db.createUploadSession(makeSession(101), 100)).resolves.toBe(false)
    await expect(activeBytes()).resolves.toBe(0)
  })
})

function makeShare(size: number, id = crypto.randomUUID(), codeHash = crypto.randomUUID(), r2Key = crypto.randomUUID()): Share {
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
  }
}

function makeSession(size: number): UploadSession {
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
  }
}

async function activeBytes(): Promise<number> {
  const row = await env.DB.prepare('SELECT active_bytes FROM storage_usage WHERE id = 1')
    .first<{ active_bytes: number }>()
  return row?.active_bytes ?? -1
}
