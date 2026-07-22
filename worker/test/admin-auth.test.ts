import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'

describe('administrator cookie session', () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS abuse_counters (
        key TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        bucket_start TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        share_id TEXT,
        subject_type TEXT,
        subject_name TEXT,
        size_bytes INTEGER,
        ip_hash TEXT,
        user_agent_hash TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL, r2_key TEXT NOT NULL, display_name TEXT,
        mime_type TEXT, size_bytes INTEGER NOT NULL, title TEXT,
        created_at TEXT NOT NULL, expire_at TEXT NOT NULL, deleted_at TEXT,
        max_downloads INTEGER, download_count INTEGER NOT NULL,
        created_ip_hash TEXT, last_access_at TEXT, object_etag TEXT,
        object_uploaded_at TEXT
      )`),
    ])
  })

  it('keeps the JWT out of JSON and accepts the HttpOnly cookie', async () => {
    const login = await loginAt('https://example.test')
    expect(login.status).toBe(200)

    const body = await login.json<Record<string, unknown>>()
    expect(JSON.stringify(body)).not.toContain('token')
    expect(body).toMatchObject({
      code: 200,
      data: { user: { username: 'admin', role: 'admin' } },
    })

    const setCookie = login.headers.get('set-cookie') || ''
    expect(setCookie).toContain('admin_session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Strict')

    const session = await SELF.fetch('https://example.test/admin/session', {
      headers: { Cookie: cookiePair(setCookie) },
    })
    expect(session.status).toBe(200)
    await expect(session.json()).resolves.toMatchObject({
      data: { user: { username: 'admin', role: 'admin' } },
    })
  })

  it('does not accept the retired Bearer-token path', async () => {
    const response = await SELF.fetch('https://example.test/admin/session', {
      headers: { Authorization: 'Bearer retired-client-token' },
    })

    expect(response.status).toBe(401)
  })

  it('rejects cross-origin cookie mutations', async () => {
    const login = await loginAt('https://example.test')
    const setCookie = login.headers.get('set-cookie') || ''
    const response = await SELF.fetch('https://example.test/admin/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookiePair(setCookie),
        Origin: 'https://attacker.example',
      },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(403)
  })

  it('allows local HTTP development without weakening production cookies', async () => {
    const login = await loginAt('http://localhost')
    const setCookie = login.headers.get('set-cookie') || ''

    expect(login.status).toBe(200)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).not.toContain('Secure')
  })

  it('returns one canonical field set for administrator shares', async () => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await env.DB.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes,
        title, created_at, expire_at, deleted_at, max_downloads,
        download_count, created_ip_hash, last_access_at, object_etag,
        object_uploaded_at
      ) VALUES (?, ?, 'file', ?, 'canonical.txt', 'text/plain', 9,
        NULL, ?, ?, NULL, 10, 2, NULL, NULL, 'etag', ?)
    `).bind(
      id,
      crypto.randomUUID(),
      `shares/${id}`,
      now,
      new Date(Date.now() + 60_000).toISOString(),
      now,
    ).run()

    const login = await loginAt('https://example.test')
    const response = await SELF.fetch('https://example.test/admin/files?page=1&page_size=10', {
      headers: { Cookie: cookiePair(login.headers.get('set-cookie') || '') },
    })
    expect(response.status).toBe(200)

    const body = await response.json<{ data: { items: Array<Record<string, unknown>> } }>()
    const item = body.data.items.find((candidate) => candidate.id === id)
    expect(item).toBeDefined()
    expect(Object.keys(item || {}).sort()).toEqual([
      'created_at',
      'display_name',
      'download_count',
      'expire_at',
      'id',
      'max_downloads',
      'size_bytes',
      'type',
    ])
  })
})

function loginAt(origin: string): Promise<Response> {
  return SELF.fetch(`${origin}/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify({
      username: 'admin',
      password: 'local-test-password',
    }),
  })
}

function cookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0]
}
