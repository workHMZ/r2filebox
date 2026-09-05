import { env, SELF } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DB } from '../src/lib/db'
import { hashCode } from '../src/lib/code'

const pepper = '1111111111111111111111111111111111111111111111111111111111111111'

describe('audit statistics', () => {
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
        subject_type TEXT, subject_name TEXT, size_bytes INTEGER,
        ip_hash TEXT, user_agent_hash TEXT, status TEXT NOT NULL,
        created_at TEXT NOT NULL
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
        updated_at TEXT NOT NULL, fingerprint_algorithm TEXT, content_fingerprint TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS file_blobs (
        id TEXT PRIMARY KEY, fingerprint_algorithm TEXT, content_fingerprint TEXT,
        r2_key TEXT NOT NULL UNIQUE, size_bytes INTEGER NOT NULL, object_etag TEXT,
        object_uploaded_at TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL,
        orphaned_at TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS upload_cleanup_jobs (
        id TEXT PRIMARY KEY, upload_id TEXT NOT NULL, r2_key TEXT NOT NULL,
        size_bytes INTEGER NOT NULL, claimed_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_usage (
        id INTEGER PRIMARY KEY CHECK (id = 1), active_bytes INTEGER NOT NULL DEFAULT 0
      )`),
    ])
    await env.DB.prepare('INSERT OR IGNORE INTO storage_usage (id, active_bytes) VALUES (1, 0)').run()
  })

  beforeEach(async () => {
    const now = new Date().toISOString()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM shares'),
      env.DB.prepare('DELETE FROM audit_logs'),
      env.DB.prepare('DELETE FROM abuse_counters'),
      env.DB.prepare('DELETE FROM settings'),
    ])
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('ENABLE_NATIVE_RATE_LIMIT','false',?)`).bind(now),
      env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('ENABLE_AUDIT_LOG','true',?)`).bind(now),
      env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('ENABLE_ACCESS_LOG','true',?)`).bind(now),
    ])
  })

  it('counts a file retrieval, not only a text retrieval', async () => {
    await createShare('FYLE2345ABCD', 'file')
    await createShare('TEXT2345ABCD', 'text')

    for (const code of ['FYLE2345ABCD', 'TEXT2345ABCD']) {
      const response = await SELF.fetch('https://example.test/api/share/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      expect(response.status, code).toBe(200)
    }

    const actions = await env.DB.prepare('SELECT action FROM audit_logs ORDER BY action')
      .all<{ action: string }>()
    expect(actions.results.map((row) => row.action)).toEqual([
      'share_resolve_file',
      'share_resolve_text',
    ])

    const stats = await new DB(env.DB).getAuditStats()
    expect(stats.completedRetrievals).toBe(2)
  })

  it('counts each kind of completed share once', async () => {
    await insertAuditRows([
      ['share_text_create', 'success'],
      ['multipart_file_complete', 'success'],
      ['instant_file_create', 'success'],
      ['multipart_file_init', 'success'],
      ['share_text_create', 'failed'],
    ])

    const stats = await new DB(env.DB).getAuditStats()
    expect(stats.completedShares).toBe(3)
    expect(stats.total).toBe(5)
  })

  it('does not double-count a legacy retrieval that also logged a download row', async () => {
    // 1.0 wrote share_resolve_file and share_download_file for one retrieval.
    await insertAuditRows([
      ['share_resolve_file', 'success'],
      ['share_download_file', 'success'],
    ])

    const stats = await new DB(env.DB).getAuditStats()
    expect(stats.completedRetrievals).toBe(1)
  })

  it('exposes the same statistics through the admin endpoint', async () => {
    await insertAuditRows([
      ['share_resolve_file', 'success'],
      ['share_resolve_text', 'success'],
    ])

    const login = await SELF.fetch('https://example.test/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
      body: JSON.stringify({ username: 'admin', password: 'local-test-password' }),
    })
    expect(login.status).toBe(200)
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0]

    const logs = await SELF.fetch('https://example.test/admin/logs/audit', {
      headers: { Cookie: cookie },
    })
    expect(logs.status).toBe(200)
    const body = await logs.json<{ data: { stats: { completedRetrievals: number } } }>()
    expect(body.data.stats.completedRetrievals).toBe(2)
  })
})

async function insertAuditRows(rows: Array<[action: string, status: string]>): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.batch(rows.map(([action, status]) => env.DB.prepare(`
    INSERT INTO audit_logs (
      id, action, share_id, subject_type, subject_name, size_bytes,
      ip_hash, user_agent_hash, status, created_at
    ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
  `).bind(crypto.randomUUID(), action, status, now)))
}

async function createShare(code: string, type: 'file' | 'text'): Promise<void> {
  const shareId = crypto.randomUUID()
  const key = `audit-stats/${shareId}`
  const content = 'audit-stats-body'
  const uploaded = await env.BUCKET.put(key, content, {
    httpMetadata: {
      contentType: type === 'file' ? 'video/mp4' : 'text/plain; charset=utf-8',
    },
  })
  const now = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO shares (
      id, code_hash, type, r2_key, display_name, mime_type, size_bytes,
      title, created_at, expire_at, deleted_at, max_downloads,
      download_count, created_ip_hash, last_access_at, object_etag,
      object_uploaded_at, blob_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 10, 0, NULL, NULL, ?, ?, NULL)
  `).bind(
    shareId,
    await hashCode(code, pepper),
    type,
    key,
    type === 'file' ? 'clip.mp4' : null,
    type === 'file' ? 'video/mp4' : 'text/plain',
    content.length,
    now,
    new Date(Date.now() + 600_000).toISOString(),
    uploaded!.etag,
    now,
  ).run()
}
