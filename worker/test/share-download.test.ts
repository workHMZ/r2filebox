import { createExecutionContext, env, SELF } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { hashCode } from '../src/lib/code'

const pepper = '1111111111111111111111111111111111111111111111111111111111111111'

describe('share download accounting', () => {
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
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY,
        share_id TEXT NOT NULL UNIQUE,
        upload_id TEXT NOT NULL,
        code_hash TEXT NOT NULL UNIQUE,
        r2_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        title TEXT,
        expire_at TEXT NOT NULL,
        max_downloads INTEGER,
        created_ip_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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
      env.DB.prepare('DELETE FROM abuse_counters'),
      env.DB.prepare('DELETE FROM settings'),
    ])
    await env.DB.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('ENABLE_NATIVE_RATE_LIMIT', 'false', ?)
    `).bind(new Date().toISOString()).run()
  })

  it('counts one extraction while allowing repeated Range requests', async () => {
    const shareId = crypto.randomUUID()
    const code = 'ABCD2345EFGH'
    const key = `test/${shareId}`
    const content = '0123456789abcdef'
    const uploaded = await env.BUCKET.put(key, content, {
      httpMetadata: { contentType: 'video/mp4' },
    })
    const now = new Date().toISOString()
    await env.DB.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes,
        title, created_at, expire_at, deleted_at, max_downloads,
        download_count, created_ip_hash, last_access_at, object_etag,
        object_uploaded_at
      ) VALUES (?, ?, 'file', ?, 'sample.mp4', 'video/mp4', ?, NULL, ?, ?,
        NULL, 1, 0, NULL, NULL, ?, ?)
    `).bind(
      shareId,
      await hashCode(code, pepper),
      key,
      content.length,
      now,
      new Date(Date.now() + 60_000).toISOString(),
      uploaded.etag,
      now,
    ).run()

    const resolveResponse = await SELF.fetch('https://example.test/api/share/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(resolveResponse.status).toBe(200)
    const cookie = cookiePair(resolveResponse.headers.get('set-cookie') || '')
    expect(cookie).toContain('download_session=')
    const body = await resolveResponse.json<{ data: { download_url: string, download_count: number } }>()
    expect(body.data.download_count).toBe(1)

    const firstRange = await SELF.fetch(`https://example.test${body.data.download_url}?disposition=inline`, {
      headers: { Cookie: cookie, Range: 'bytes=0-3' },
    })
    expect(firstRange.status).toBe(206)
    expect(firstRange.headers.get('content-disposition')).toMatch(/^inline;/)
    expect(firstRange.headers.get('set-cookie')).toBeNull()
    expect(new TextDecoder().decode(await firstRange.arrayBuffer())).toBe('0123')

    const secondRange = await SELF.fetch(`https://example.test${body.data.download_url}?disposition=attachment`, {
      headers: { Cookie: cookie, Range: 'bytes=4-7' },
    })
    expect(secondRange.status).toBe(206)
    expect(secondRange.headers.get('content-disposition')).toMatch(/^attachment;/)
    expect(new TextDecoder().decode(await secondRange.arrayBuffer())).toBe('4567')

    const notModified = await SELF.fetch(`https://example.test${body.data.download_url}`, {
      headers: { Cookie: cookie, 'If-None-Match': uploaded.httpEtag },
    })
    expect(notModified.status).toBe(304)

    const fullDownload = await SELF.fetch(
      `https://example.test${body.data.download_url}?disposition=attachment`,
      { headers: { Cookie: cookie } },
    )
    expect(fullDownload.status).toBe(200)
    expect(fullDownload.headers.get('content-range')).toBeNull()
    expect(new TextDecoder().decode(await fullDownload.arrayBuffer())).toBe(content)

    const stored = await env.DB.prepare('SELECT download_count FROM shares WHERE id = ?')
      .bind(shareId)
      .first<{ download_count: number }>()
    expect(stored?.download_count).toBe(1)

    const exhausted = await SELF.fetch('https://example.test/api/share/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(exhausted.status).toBe(404)
  })

  it('consumes a text extraction before reading its R2 body', async () => {
    const code = 'JKLM2345NPQR'
    const content = 'text body must only be read after authorization'
    await createTextShare(code, content)

    const events: string[] = []
    const instrumentedDb = new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === 'prepare') {
          return (query: string) => {
            const statement = target.prepare(query)
            return query.includes('SET download_count = download_count + 1')
              ? trackStatementRun(statement, () => events.push('consume'))
              : statement
          }
        }
        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const instrumentedBucket = new Proxy(env.BUCKET, {
      get(target, property, receiver) {
        if (property === 'get') {
          return (objectKey: string, options?: R2GetOptions) => {
            events.push('get')
            return target.get(objectKey, options)
          }
        }
        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const instrumentedEnv = new Proxy(env, {
      get(target, property, receiver) {
        if (property === 'DB') return instrumentedDb
        if (property === 'BUCKET') return instrumentedBucket
        return Reflect.get(target, property, receiver)
      },
    })

    const response = await worker.fetch(
      new Request('https://example.test/api/share/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
      instrumentedEnv,
      createExecutionContext(),
    )

    expect(response.status).toBe(200)
    const body = await response.json<{ data: { text: string, download_count: number } }>()
    expect(body.data).toMatchObject({ text: content, download_count: 1 })
    expect(events).toEqual(['consume', 'get'])
  })

  it('allows only the winning concurrent text extraction to read R2', async () => {
    const code = 'STUV2345WXYZ'
    const { shareId } = await createTextShare(code, 'single-use concurrent text')
    let bodyReads = 0
    let shareSelections = 0
    let releaseSelections = () => {}
    const bothSelected = new Promise<void>((resolve) => {
      releaseSelections = resolve
    })
    const instrumentedDb = new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === 'prepare') {
          return (query: string) => {
            const statement = target.prepare(query)
            if (!query.includes('SELECT * FROM shares WHERE code_hash')) return statement
            return trackStatementFirst(statement, async () => {
              shareSelections += 1
              if (shareSelections === 2) releaseSelections()
              await bothSelected
            })
          }
        }
        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const instrumentedBucket = new Proxy(env.BUCKET, {
      get(target, property, receiver) {
        if (property === 'get') {
          return (objectKey: string, options?: R2GetOptions) => {
            bodyReads += 1
            return target.get(objectKey, options)
          }
        }
        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const instrumentedEnv = new Proxy(env, {
      get(target, property, receiver) {
        if (property === 'DB') return instrumentedDb
        if (property === 'BUCKET') return instrumentedBucket
        return Reflect.get(target, property, receiver)
      },
    })
    const resolveText = () => worker.fetch(
      new Request('https://example.test/api/share/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
      instrumentedEnv,
      createExecutionContext(),
    )

    const responses = await Promise.all([resolveText(), resolveText()])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 404])
    expect(bodyReads).toBe(1)
    const stored = await env.DB.prepare('SELECT download_count FROM shares WHERE id = ?')
      .bind(shareId)
      .first<{ download_count: number }>()
    expect(stored?.download_count).toBe(1)
  })

  it('rejects upload parts after the D1 session is revoked', async () => {
    const init = await SELF.fetch('https://example.test/api/share/file/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'revoked.bin', mimeType: 'application/octet-stream', size: 1 }),
    })
    expect(init.status).toBe(200)
    const body = await init.json<{ data: { uploadToken: string } }>()

    const abort = await SELF.fetch('https://example.test/api/share/file/abort', {
      method: 'POST',
      headers: { 'X-Upload-Token': body.data.uploadToken },
    })
    expect(abort.status).toBe(200)

    const part = await SELF.fetch('https://example.test/api/share/file/part', {
      method: 'PUT',
      headers: {
        'Content-Length': '1',
        'Content-Type': 'application/octet-stream',
        'X-Part-Number': '1',
        'X-Upload-Token': body.data.uploadToken,
      },
      body: 'x',
    })
    expect(part.status).toBe(404)
  })
})

function cookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0]
}

function trackStatementRun(
  statement: D1PreparedStatement,
  beforeRun: () => void,
): D1PreparedStatement {
  return new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind') {
        return (...values: unknown[]) => trackStatementRun(target.bind(...values), beforeRun)
      }
      if (property === 'run') {
        return () => {
          beforeRun()
          return target.run()
        }
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function trackStatementFirst(
  statement: D1PreparedStatement,
  afterFirst: () => Promise<void>,
): D1PreparedStatement {
  return new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind') {
        return (...values: unknown[]) => trackStatementFirst(target.bind(...values), afterFirst)
      }
      if (property === 'first') {
        return async (columnName?: string) => {
          const result = columnName === undefined
            ? await target.first()
            : await target.first(columnName)
          await afterFirst()
          return result
        }
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

async function createTextShare(code: string, content: string): Promise<{ shareId: string }> {
  const shareId = crypto.randomUUID()
  const key = `text/${shareId}`
  const uploaded = await env.BUCKET.put(key, content, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
  })
  const now = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO shares (
      id, code_hash, type, r2_key, display_name, mime_type, size_bytes,
      title, created_at, expire_at, deleted_at, max_downloads,
      download_count, created_ip_hash, last_access_at, object_etag,
      object_uploaded_at
    ) VALUES (?, ?, 'text', ?, NULL, 'text/plain', ?, NULL, ?, ?,
      NULL, 1, 0, NULL, NULL, ?, ?)
  `).bind(
    shareId,
    await hashCode(code, pepper),
    key,
    content.length,
    now,
    new Date(Date.now() + 60_000).toISOString(),
    uploaded.etag,
    now,
  ).run()
  return { shareId }
}
