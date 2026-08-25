import { env, SELF } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DB } from '../src/lib/db'
import { hashCode } from '../src/lib/code'

const pepper = '1111111111111111111111111111111111111111111111111111111111111111'

describe('share code reservation', () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS abuse_counters (
        key TEXT PRIMARY KEY, action TEXT NOT NULL, ip_hash TEXT NOT NULL,
        bucket_start TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY, action TEXT NOT NULL, share_id TEXT,
        subject_type TEXT, subject_name TEXT, size_bytes INTEGER, ip_hash TEXT,
        user_agent_hash TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL
      )`),
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
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_usage (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_bytes INTEGER NOT NULL DEFAULT 0
      )`),
    ])
    await env.DB.prepare('INSERT OR IGNORE INTO storage_usage (id, active_bytes) VALUES (1, 0)').run()
  })

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM shares'),
      env.DB.prepare('DELETE FROM upload_sessions'),
      env.DB.prepare('DELETE FROM abuse_counters'),
      env.DB.prepare('DELETE FROM settings'),
    ])
    await env.DB.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('ENABLE_NATIVE_RATE_LIMIT', 'false', ?)
    `).bind(new Date().toISOString()).run()
  })

  it('treats a code as taken while any share still holds it', async () => {
    const db = new DB(env.DB)
    const codeHash = await hashCode('ABCD2345EFGH', pepper)
    expect(await db.isCodeHashAvailable(codeHash)).toBe(true)

    const now = new Date().toISOString()
    await env.DB.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes, title,
        created_at, expire_at, deleted_at, max_downloads, download_count,
        created_ip_hash, last_access_at, object_etag, object_uploaded_at, blob_id
      ) VALUES (?, ?, 'text', 'text/key', NULL, 'text/plain', 4, NULL, ?, ?,
        NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL)
    `).bind(crypto.randomUUID(), codeHash, now, new Date(Date.now() + 60_000).toISOString()).run()

    expect(await db.isCodeHashAvailable(codeHash)).toBe(false)
  })

  it('treats a code as taken while an upload session still reserves it', async () => {
    const db = new DB(env.DB)
    const codeHash = await hashCode('MNPQ3456RSTU', pepper)
    const now = new Date().toISOString()
    await env.DB.prepare(`
      INSERT INTO upload_sessions (
        id, share_id, upload_id, code_hash, r2_key, display_name, mime_type,
        size_bytes, title, expire_at, max_downloads, created_ip_hash,
        created_at, updated_at, fingerprint_algorithm, content_fingerprint
      ) VALUES (?, ?, 'upload-1', ?, 'objects/pending', 'a.bin',
        'application/octet-stream', 8, NULL, ?, NULL, NULL, ?, ?, NULL, NULL)
    `).bind(
      crypto.randomUUID(),
      crypto.randomUUID(),
      codeHash,
      new Date(Date.now() + 60_000).toISOString(),
      now,
      now,
    ).run()

    // An in-flight upload owns its code until it completes or is cleaned up;
    // handing the same code to a new share would fail its INSERT much later.
    expect(await db.isCodeHashAvailable(codeHash)).toBe(false)
  })

  it('still counts a soft-deleted share, whose row keeps the UNIQUE code', async () => {
    const db = new DB(env.DB)
    const codeHash = await hashCode('VWXY4567ZABC', pepper)
    const now = new Date().toISOString()
    await env.DB.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes, title,
        created_at, expire_at, deleted_at, max_downloads, download_count,
        created_ip_hash, last_access_at, object_etag, object_uploaded_at, blob_id
      ) VALUES (?, ?, 'text', 'text/deleted', NULL, 'text/plain', 4, NULL, ?, ?,
        ?, NULL, 0, NULL, NULL, NULL, NULL, NULL)
    `).bind(
      crypto.randomUUID(),
      codeHash,
      now,
      new Date(Date.now() + 60_000).toISOString(),
      now,
    ).run()

    expect(await db.isCodeHashAvailable(codeHash)).toBe(false)
  })

  it('issues a usable code for a text share created through the API', async () => {
    const response = await SELF.fetch('https://example.test/api/share/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'reserved code round trip', expire_value: 1, expire_style: 'hour' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json<{ data: { code: string } }>()
    expect(body.data.code).toMatch(/^[23456789A-HJ-NP-Za-km-z]+$/)

    const db = new DB(env.DB)
    expect(await db.isCodeHashAvailable(await hashCode(body.data.code, pepper))).toBe(false)

    const resolved = await SELF.fetch('https://example.test/api/share/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: body.data.code }),
    })
    expect(resolved.status).toBe(200)
  })
})
