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
        object_uploaded_at TEXT, blob_id TEXT
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
        updated_at TEXT NOT NULL,
        fingerprint_algorithm TEXT,
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
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_usage (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_bytes INTEGER NOT NULL DEFAULT 0
      )`),
      env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS download_active_blob_fingerprint
        ON file_blobs(fingerprint_algorithm, content_fingerprint, size_bytes)
        WHERE status = 'active'
          AND fingerprint_algorithm IS NOT NULL
          AND content_fingerprint IS NOT NULL`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_storage_text_shares_insert
        AFTER INSERT ON shares
        WHEN NEW.type = 'text' AND NEW.deleted_at IS NULL BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_storage_text_shares_update
        AFTER UPDATE OF type, deleted_at, size_bytes ON shares BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes
            - CASE WHEN OLD.type = 'text' AND OLD.deleted_at IS NULL THEN OLD.size_bytes ELSE 0 END
            + CASE WHEN NEW.type = 'text' AND NEW.deleted_at IS NULL THEN NEW.size_bytes ELSE 0 END
          WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_storage_text_shares_delete
        AFTER DELETE ON shares
        WHEN OLD.type = 'text' AND OLD.deleted_at IS NULL BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_storage_uploads_insert
        AFTER INSERT ON upload_sessions BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_storage_uploads_update
        AFTER UPDATE OF size_bytes ON upload_sessions BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_storage_uploads_delete
        AFTER DELETE ON upload_sessions BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_storage_blobs_insert
        AFTER INSERT ON file_blobs BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_storage_blobs_update
        AFTER UPDATE OF size_bytes ON file_blobs BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_storage_blobs_delete
        AFTER DELETE ON file_blobs BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_legacy_blob_after_file_share_insert
        AFTER INSERT ON shares
        WHEN NEW.type = 'file' AND NEW.deleted_at IS NULL AND NEW.blob_id IS NULL BEGIN
          INSERT INTO file_blobs (
            id, fingerprint_algorithm, content_fingerprint, r2_key, size_bytes,
            object_etag, object_uploaded_at, status, created_at, orphaned_at
          ) VALUES (
            'legacy-' || NEW.id, NULL, NULL, NEW.r2_key, NEW.size_bytes,
            NEW.object_etag, NEW.object_uploaded_at, 'active',
            COALESCE(NEW.object_uploaded_at, NEW.created_at), NULL
          );
          UPDATE shares SET blob_id = 'legacy-' || NEW.id WHERE id = NEW.id AND blob_id IS NULL;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_orphan_blob_after_share_update
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
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS download_orphan_blob_after_share_delete
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
    await env.DB.prepare('INSERT OR IGNORE INTO storage_usage (id, active_bytes) VALUES (1, 0)').run()
  })

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM shares'),
      env.DB.prepare('DELETE FROM upload_sessions'),
      env.DB.prepare('DELETE FROM upload_cleanup_jobs'),
      env.DB.prepare('DELETE FROM file_blobs'),
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

  it('answers an unsatisfiable Range with 416 instead of a misleading 206', async () => {
    const code = 'HJKL2345MNPQ'
    const content = '0123456789abcdef'
    await createFileShare(code, 'clip.mp4', 'video/mp4', content)
    const cookie = await openDownloadSession(code)
    const downloadUrl = cookie.downloadUrl

    const beyondEnd = await SELF.fetch(`https://example.test${downloadUrl}`, {
      headers: { Cookie: cookie.header, Range: `bytes=${content.length}-${content.length + 10}` },
    })
    expect(beyondEnd.status).toBe(416)
    expect(beyondEnd.headers.get('content-range')).toBe(`bytes */${content.length}`)
    expect(beyondEnd.headers.get('accept-ranges')).toBe('bytes')
    expect(await beyondEnd.text()).not.toBe(content)

    const zeroSuffix = await SELF.fetch(`https://example.test${downloadUrl}`, {
      headers: { Cookie: cookie.header, Range: 'bytes=-0' },
    })
    expect(zeroSuffix.status).toBe(416)
  })

  it('declares Content-Length on a full download so the browser can show progress', async () => {
    const code = 'LNGT2345HJKM'
    const content = '0123456789abcdef'
    await createFileShare(code, 'clip.mp4', 'video/mp4', content)
    const cookie = await openDownloadSession(code)

    const response = await SELF.fetch(`https://example.test${cookie.downloadUrl}`, {
      headers: { Cookie: cookie.header },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(String(content.length))
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(content)
  })

  it('reports the pickup window so the page can warn before the session lapses', async () => {
    const code = 'WNDW2345HJKM'
    await createFileShare(code, 'clip.mp4', 'video/mp4', '0123456789abcdef')

    const response = await SELF.fetch('https://example.test/api/share/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(response.status).toBe(200)
    const body = await response.json<{ data: { download_expires_at: string } }>()
    const expiresAt = Date.parse(body.data.download_expires_at)
    expect(Number.isFinite(expiresAt)).toBe(true)
    expect(expiresAt).toBeGreaterThan(Date.now())

    const cookieMaxAge = Number(
      /max-age=(\d+)/i.exec(response.headers.get('set-cookie') || '')?.[1],
    )
    // The advertised window must not outlast the cookie that actually carries it.
    expect(Math.round((expiresAt - Date.now()) / 1000)).toBeLessThanOrEqual(cookieMaxAge)
  })

  it('serves a malformed Range as a complete 200 body', async () => {
    const code = 'RSTU2345VWXY'
    const content = '0123456789abcdef'
    await createFileShare(code, 'clip.mp4', 'video/mp4', content)
    const cookie = await openDownloadSession(code)

    for (const range of ['bytes=abc', 'bytes=5-3', 'bytes=0-1,4-5']) {
      const response = await SELF.fetch(`https://example.test${cookie.downloadUrl}`, {
        headers: { Cookie: cookie.header, Range: range },
      })
      expect(response.status, range).toBe(200)
      expect(response.headers.get('content-range'), range).toBeNull()
      expect(new TextDecoder().decode(await response.arrayBuffer()), range).toBe(content)
    }
  })

  it('serves suffix and open-ended Range requests from the requested offset', async () => {
    const code = 'ZABC2345DEFG'
    const content = '0123456789abcdef'
    await createFileShare(code, 'clip.mp4', 'video/mp4', content)
    const cookie = await openDownloadSession(code)

    const suffix = await SELF.fetch(`https://example.test${cookie.downloadUrl}`, {
      headers: { Cookie: cookie.header, Range: 'bytes=-4' },
    })
    expect(suffix.status).toBe(206)
    expect(suffix.headers.get('content-range')).toBe('bytes 12-15/16')
    expect(suffix.headers.get('content-length')).toBe('4')
    expect(new TextDecoder().decode(await suffix.arrayBuffer())).toBe('cdef')

    const openEnded = await SELF.fetch(`https://example.test${cookie.downloadUrl}`, {
      headers: { Cookie: cookie.header, Range: 'bytes=8-' },
    })
    expect(openEnded.status).toBe(206)
    expect(openEnded.headers.get('content-range')).toBe('bytes 8-15/16')
    expect(new TextDecoder().decode(await openEnded.arrayBuffer())).toBe('89abcdef')

    // An end past the object is clamped, not treated as a failure.
    const clamped = await SELF.fetch(`https://example.test${cookie.downloadUrl}`, {
      headers: { Cookie: cookie.header, Range: 'bytes=12-999' },
    })
    expect(clamped.status).toBe(206)
    expect(clamped.headers.get('content-range')).toBe('bytes 12-15/16')
    expect(new TextDecoder().decode(await clamped.arrayBuffer())).toBe('cdef')
  })

  it('keeps the text extraction when the stored object is already gone', async () => {
    const code = 'DEFG2345HJKL'
    const content = 'the object behind this share disappears'
    const { shareId } = await createTextShare(code, content)
    const stored = await env.DB.prepare('SELECT r2_key FROM shares WHERE id = ?')
      .bind(shareId)
      .first<{ r2_key: string }>()
    await env.BUCKET.delete(stored!.r2_key)

    const missing = await SELF.fetch('https://example.test/api/share/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(missing.status).toBe(404)

    // The share allows a single extraction, so a burnt slot would make the
    // restored object permanently unreachable.
    const afterMiss = await env.DB.prepare('SELECT download_count FROM shares WHERE id = ?')
      .bind(shareId)
      .first<{ download_count: number }>()
    expect(afterMiss?.download_count).toBe(0)

    await env.BUCKET.put(stored!.r2_key, content, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    })
    const restored = await SELF.fetch('https://example.test/api/share/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(restored.status).toBe(200)
    await expect(restored.json()).resolves.toMatchObject({ data: { text: content } })
  })

  it.each([
    {
      label: 'MOV',
      code: 'CDEF2345GHJK',
      filename: 'legacy.MOV',
      expectedMimeType: 'video/quicktime',
    },
    {
      label: 'HEIC',
      code: 'MNPQ3456RSTU',
      filename: 'legacy.HEIC',
      expectedMimeType: 'image/heic',
    },
  ])('restores effective MIME for an old generic $label share', async ({
    code,
    filename,
    expectedMimeType,
  }) => {
    const content = `legacy content for ${filename}`
    await createFileShare(code, filename, 'application/octet-stream', content)

    const metricWrites: Parameters<AnalyticsEngineDataset['writeDataPoint']>[0][] = []
    const instrumentedEnv = new Proxy(env, {
      get(target, property, receiver) {
        if (property === 'ANALYTICS') {
          return {
            writeDataPoint(data: Parameters<AnalyticsEngineDataset['writeDataPoint']>[0]) {
              metricWrites.push(data)
            },
          }
        }
        return Reflect.get(target, property, receiver)
      },
    })
    const resolveResponse = await worker.fetch(new Request('https://example.test/api/share/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }), instrumentedEnv, createExecutionContext())
    expect(resolveResponse.status).toBe(200)
    const body = await resolveResponse.json<{
      data: { mime_type: string, download_url: string }
    }>()
    expect(body.data.mime_type).toBe(expectedMimeType)
    expect(metricWrites).toHaveLength(1)
    expect(metricWrites[0]?.blobs).toEqual([
      'download_file',
      'success',
      'file',
      expectedMimeType,
    ])

    const download = await SELF.fetch(
      `https://example.test${body.data.download_url}?disposition=inline`,
      { headers: { Cookie: cookiePair(resolveResponse.headers.get('set-cookie') || '') } },
    )
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe(expectedMimeType)
    expect(download.headers.get('content-disposition')).toMatch(/^inline;/)
    expect(download.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new TextDecoder().decode(await download.arrayBuffer())).toBe(content)
  })

  it('keeps an inferred SVG response as an attachment', async () => {
    const code = 'VWXY4567ZABC'
    await createFileShare(
      code,
      'legacy.SVG',
      'application/octet-stream',
      '<svg xmlns="http://www.w3.org/2000/svg"><script /></svg>',
    )

    const resolveResponse = await SELF.fetch('https://example.test/api/share/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(resolveResponse.status).toBe(200)
    const body = await resolveResponse.json<{
      data: { mime_type: string, download_url: string }
    }>()
    expect(body.data.mime_type).toBe('image/svg+xml')

    const download = await SELF.fetch(
      `https://example.test${body.data.download_url}?disposition=inline`,
      { headers: { Cookie: cookiePair(resolveResponse.headers.get('set-cookie') || '') } },
    )
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('image/svg+xml')
    expect(download.headers.get('content-disposition')).toMatch(/^attachment;/)
    expect(download.headers.get('x-content-type-options')).toBe('nosniff')
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

  it.each([
    ['C:\\fakepath\\UPLOAD.MOV', 'UPLOAD.MOV', 'video/quicktime'],
    ['/private/tmp/UPLOAD.HEIC', 'UPLOAD.HEIC', 'image/heic'],
  ])('sanitizes %s before resolving its upload MIME', async (
    requestedFilename,
    storedFilename,
    expectedMimeType,
  ) => {
    const init = await SELF.fetch('https://example.test/api/share/file/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: requestedFilename,
        mimeType: 'application/octet-stream',
        size: 1,
      }),
    })
    expect(init.status).toBe(200)
    const body = await init.json<{ data: { uploadToken: string } }>()

    const session = await env.DB.prepare(`
      SELECT display_name, mime_type
      FROM upload_sessions
      WHERE display_name = ?
    `).bind(storedFilename).first<{ display_name: string, mime_type: string }>()
    expect(session).toEqual({
      display_name: storedFilename,
      mime_type: expectedMimeType,
    })

    const abort = await SELF.fetch('https://example.test/api/share/file/abort', {
      method: 'POST',
      headers: { 'X-Upload-Token': body.data.uploadToken },
    })
    expect(abort.status).toBe(200)
  })

  it('does not abort the upload session when a part is uploaded incompletely', async () => {
    const init = await SELF.fetch('https://example.test/api/share/file/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'incomplete.bin', mimeType: 'application/octet-stream', size: 100 }),
    })
    expect(init.status).toBe(200)
    const body = await init.json<{ data: { uploadToken: string } }>()

    const request = new Request('https://example.test/api/share/file/part', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Part-Number': '1',
        'X-Upload-Token': body.data.uploadToken,
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(50))
          controller.close()
        }
      })
    })

    expect(request.headers.get('Content-Length')).toBeNull()

    const part = await SELF.fetch(request)
    expect(part.status).toBe(400)
    const partBody = await part.json<{ error_code: string }>()
    expect(partBody.error_code).toBe('api.share.partIncompleteRetry')

    // Verify session still exists in D1
    const session = await env.DB
      .prepare(`
        SELECT id
        FROM upload_sessions
        WHERE display_name = ?
      `)
      .bind('incomplete.bin')
      .first()

    expect(session).not.toBeNull()

    // Retry same part with correct size
    const partRetry = await SELF.fetch('https://example.test/api/share/file/part', {
      method: 'PUT',
      headers: {
        'Content-Length': '100',
        'Content-Type': 'application/octet-stream',
        'X-Part-Number': '1',
        'X-Upload-Token': body.data.uploadToken,
      },
      body: new Uint8Array(100),
    })
    expect(partRetry.status).toBe(200)
  })

  it('rejects an oversized chunked part before writing it to R2', async () => {
    const init = await SELF.fetch('https://example.test/api/share/file/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'oversized.bin', mimeType: 'application/octet-stream', size: 100 }),
    })
    expect(init.status).toBe(200)
    const body = await init.json<{ data: { uploadToken: string } }>()

    const part = await SELF.fetch(new Request('https://example.test/api/share/file/part', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Part-Number': '1',
        'X-Upload-Token': body.data.uploadToken,
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(101))
          controller.close()
        },
      }),
    }))
    expect(part.status).toBe(413)

    const session = await env.DB.prepare(`
      SELECT id FROM upload_sessions WHERE display_name = 'oversized.bin'
    `).first()
    expect(session).not.toBeNull()
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

async function openDownloadSession(code: string): Promise<{ header: string, downloadUrl: string }> {
  const response = await SELF.fetch('https://example.test/api/share/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  expect(response.status).toBe(200)
  const body = await response.json<{ data: { download_url: string } }>()
  return {
    header: cookiePair(response.headers.get('set-cookie') || ''),
    downloadUrl: body.data.download_url,
  }
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

async function createFileShare(
  code: string,
  displayName: string,
  mimeType: string,
  content: string,
): Promise<{ shareId: string }> {
  const shareId = crypto.randomUUID()
  const key = `file/${shareId}`
  const uploaded = await env.BUCKET.put(key, content, {
    httpMetadata: { contentType: mimeType },
  })
  const now = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO shares (
      id, code_hash, type, r2_key, display_name, mime_type, size_bytes,
      title, created_at, expire_at, deleted_at, max_downloads,
      download_count, created_ip_hash, last_access_at, object_etag,
      object_uploaded_at
    ) VALUES (?, ?, 'file', ?, ?, ?, ?, NULL, ?, ?,
      NULL, 10, 0, NULL, NULL, ?, ?)
  `).bind(
    shareId,
    await hashCode(code, pepper),
    key,
    displayName,
    mimeType,
    content.length,
    now,
    new Date(Date.now() + 60_000).toISOString(),
    uploaded.etag,
    now,
  ).run()
  return { shareId }
}
