import { createExecutionContext, env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { signJWT } from '../src/lib/auth'
import type { Env } from '../src/types'

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

  it('returns maintenance runtime and configured storage resources', async () => {
    const login = await loginAt('https://example.test')
    const response = await SELF.fetch('https://example.test/admin/maintenance/system-info', {
      headers: { Cookie: cookiePair(login.headers.get('set-cookie') || '') },
    })

    expect(response.status).toBe(200)
    const body = await response.json<{
      data: {
        runtime: string
        platform: string
        storage: string
        version: string
        r2_bucket_name: string | null
        d1_database_name: string | null
      }
    }>()
    expect(body.data).toEqual({
      runtime: 'Cloudflare Workers',
      platform: 'V8 isolate',
      storage: 'D1 + R2 + Workers Rate Limiting',
      version: '2.3',
      r2_bucket_name: 'r2filebox-files',
      d1_database_name: 'r2filebox-db',
    })
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

  it('stores application settings in D1 instead of deployment variables', async () => {
    const login = await loginAt('https://example.test')
    const settings = {
      base: { name: 'Configured R2FileBox', description: 'Configured in D1' },
      storage: { max_total_storage_bytes: 12 * 1024 * 1024 * 1024 },
      transfer: {
        max_count: 25,
        expire_default: 48,
        max_expire_hours: 720,
        enable_text_share: 0,
        enable_file_share: 1,
        upload: { openupload: 1, uploadsize: 64 * 1024 * 1024 },
        rate_limit: {
          enabled: 1,
          upload_per_minute: 11,
          upload_part_per_minute: 81,
          resolve_per_minute: 121,
          download_per_minute: 122,
          auth_per_15_min: 21,
        },
      },
      security: {
        enable_audit_log: 1,
        enable_access_log: 0,
        require_turnstile: 0,
        turnstile_site_key: '',
      },
    }

    try {
      const response = await SELF.fetch('https://example.test/admin/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookiePair(login.headers.get('set-cookie') || ''),
          Origin: 'https://example.test',
        },
        body: JSON.stringify(settings),
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        data: {
          storage: { max_total_storage_bytes: settings.storage.max_total_storage_bytes },
          transfer: {
            max_count: 25,
            expire_default: 48,
            max_expire_hours: 720,
            enable_text_share: 0,
            enable_file_share: 1,
            upload: { uploadsize: 64 * 1024 * 1024 },
          },
        },
      })

      const rows = await env.DB.prepare(`
        SELECT key, value FROM settings
        WHERE key IN ('MAX_TOTAL_STORAGE_BYTES', 'MAX_EXPIRE_HOURS', 'ENABLE_TEXT_SHARE')
        ORDER BY key
      `).all<{ key: string, value: string }>()
      expect(rows.results).toEqual([
        { key: 'ENABLE_TEXT_SHARE', value: 'false' },
        { key: 'MAX_EXPIRE_HOURS', value: '720' },
        { key: 'MAX_TOTAL_STORAGE_BYTES', value: String(settings.storage.max_total_storage_bytes) },
      ])
    } finally {
      await env.DB.prepare('DELETE FROM settings').run()
    }
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

  it('removes the R2 object before soft-deleting its D1 share', async () => {
    const id = crypto.randomUUID()
    const key = `admin-delete/${id}`
    const now = new Date().toISOString()
    await env.BUCKET.put(key, 'delete me')
    await env.DB.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes,
        title, created_at, expire_at, deleted_at, max_downloads,
        download_count, created_ip_hash, last_access_at, object_etag,
        object_uploaded_at
      ) VALUES (?, ?, 'file', ?, 'delete.txt', 'text/plain', 9,
        NULL, ?, ?, NULL, 10, 0, NULL, NULL, NULL, ?)
    `).bind(
      id,
      crypto.randomUUID(),
      key,
      now,
      new Date(Date.now() + 60_000).toISOString(),
      now,
    ).run()

    const login = await loginAt('https://example.test')
    const response = await SELF.fetch(`https://example.test/admin/files/${id}`, {
      method: 'DELETE',
      headers: {
        Cookie: cookiePair(login.headers.get('set-cookie') || ''),
        Origin: 'https://example.test',
      },
    })

    expect(response.status).toBe(200)
    expect(await env.BUCKET.head(key)).toBeNull()
    const stored = await env.DB.prepare('SELECT deleted_at FROM shares WHERE id = ?')
      .bind(id)
      .first<{ deleted_at: string | null }>()
    expect(stored?.deleted_at).not.toBeNull()
  })

  it('keeps the D1 share active when R2 deletion fails', async () => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await env.DB.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes,
        title, created_at, expire_at, deleted_at, max_downloads,
        download_count, created_ip_hash, last_access_at, object_etag,
        object_uploaded_at
      ) VALUES (?, ?, 'file', ?, 'retry.txt', 'text/plain', 5,
        NULL, ?, ?, NULL, 10, 0, NULL, NULL, NULL, ?)
    `).bind(
      id,
      crypto.randomUUID(),
      `admin-delete-failure/${id}`,
      now,
      new Date(Date.now() + 60_000).toISOString(),
      now,
    ).run()

    const sessionSecret = '2222222222222222222222222222222222222222222222222222222222222222'
    const token = await signJWT({
      sub: 'admin',
      username: 'admin',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 60,
    }, sessionSecret)
    const failingEnv = {
      DB: env.DB,
      SESSION_SECRET: sessionSecret,
      BUCKET: {
        async delete() {
          throw new Error('R2 unavailable')
        },
      },
    } as unknown as Env
    const response = await worker.fetch(
      new Request(`https://example.test/admin/files/${id}`, {
        method: 'DELETE',
        headers: {
          Cookie: `admin_session=${encodeURIComponent(token)}`,
          Origin: 'https://example.test',
        },
      }),
      failingEnv,
      createExecutionContext(),
    )

    expect(response.status).toBe(500)
    const stored = await env.DB.prepare('SELECT deleted_at FROM shares WHERE id = ?')
      .bind(id)
      .first<{ deleted_at: string | null }>()
    expect(stored?.deleted_at).toBeNull()
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
