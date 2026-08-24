import { createExecutionContext, env, SELF } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import {
  CONTENT_FINGERPRINT_ALGORITHM,
  CONTENT_FINGERPRINT_PART_SIZE,
  deriveContentFingerprint,
  sha256Bytes,
} from '../src/lib/content-fingerprint'

interface UploadInitData {
  instantUpload: boolean
  uploadToken?: string
  code: string
  partSize?: number
  partCount?: number
  share_url?: string
  file_name?: string
  dedupToken?: string
  dedupTokenExpiresAt?: string
}

interface PartData {
  partNumber: number
  etag: string
  sha256: string
  partSize: number
  receipt: string
}

describe('verified instant upload', () => {
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
        updated_at TEXT NOT NULL, fingerprint_algorithm TEXT,
        content_fingerprint TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_usage (
        id INTEGER PRIMARY KEY CHECK (id = 1), active_bytes INTEGER NOT NULL DEFAULT 0
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS file_blobs (
        id TEXT PRIMARY KEY, fingerprint_algorithm TEXT,
        content_fingerprint TEXT, r2_key TEXT NOT NULL UNIQUE,
        size_bytes INTEGER NOT NULL, object_etag TEXT,
        object_uploaded_at TEXT, status TEXT NOT NULL,
        created_at TEXT NOT NULL, orphaned_at TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS upload_cleanup_jobs (
        id TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL,
        r2_key TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        claimed_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS test_file_blobs_active_fingerprint
        ON file_blobs(fingerprint_algorithm, content_fingerprint, size_bytes)
        WHERE status = 'active' AND fingerprint_algorithm IS NOT NULL
          AND content_fingerprint IS NOT NULL`),
      env.DB.prepare('INSERT OR IGNORE INTO storage_usage (id, active_bytes) VALUES (1, 0)'),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_instant_storage_upload_insert
        AFTER INSERT ON upload_sessions BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_instant_storage_upload_delete
        AFTER DELETE ON upload_sessions BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_instant_storage_blob_insert
        AFTER INSERT ON file_blobs BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes + NEW.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_instant_storage_blob_delete
        AFTER DELETE ON file_blobs BEGIN
          UPDATE storage_usage SET active_bytes = active_bytes - OLD.size_bytes WHERE id = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_instant_orphan_share_update
        AFTER UPDATE OF deleted_at ON shares
        WHEN OLD.type = 'file' AND OLD.deleted_at IS NULL
          AND NEW.deleted_at IS NOT NULL AND OLD.blob_id IS NOT NULL
        BEGIN
          UPDATE file_blobs SET status = 'orphaned', orphaned_at = NEW.deleted_at
          WHERE id = OLD.blob_id AND status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM shares
              WHERE shares.blob_id = OLD.blob_id AND shares.deleted_at IS NULL
            );
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS test_instant_legacy_share_insert
        AFTER INSERT ON shares
        WHEN NEW.type = 'file' AND NEW.deleted_at IS NULL AND NEW.blob_id IS NULL
        BEGIN
          INSERT INTO file_blobs (
            id, fingerprint_algorithm, content_fingerprint, r2_key, size_bytes,
            object_etag, object_uploaded_at, status, created_at, orphaned_at
          ) VALUES (
            'legacy-' || NEW.id, NULL, NULL, NEW.r2_key, NEW.size_bytes,
            NEW.object_etag, NEW.object_uploaded_at, 'active',
            COALESCE(NEW.object_uploaded_at, NEW.created_at), NULL
          );
          UPDATE shares SET blob_id = 'legacy-' || NEW.id WHERE id = NEW.id;
        END`),
    ])
  })

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM shares').run()
    await env.DB.prepare('DELETE FROM upload_sessions').run()
    await env.DB.prepare('DELETE FROM upload_cleanup_jobs').run()
    await env.DB.prepare('DELETE FROM file_blobs').run()
    await env.DB.prepare('DELETE FROM audit_logs').run()
    await env.DB.prepare('DELETE FROM abuse_counters').run()
    await env.DB.prepare('DELETE FROM settings').run()
    await env.DB.prepare('UPDATE storage_usage SET active_bytes = 0 WHERE id = 1').run()
    await env.DB.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('ENABLE_NATIVE_RATE_LIMIT', 'false', ?)
    `).bind(new Date().toISOString()).run()
    const listed = await env.BUCKET.list()
    if (listed.objects.length) {
      await env.BUCKET.delete(listed.objects.map((object) => object.key))
    }
  })

  it('reuses one verified R2 blob while creating an independent second share', async () => {
    const content = new TextEncoder().encode('same bytes, independent pickup codes')
    const manifest = await contentManifest(content)
    const first = await completeUpload('first.bin', content, manifest)

    expect(first.instantUpload).toBe(false)
    expect(first.dedupToken).toBeTruthy()
    expect(first.dedupTokenExpiresAt).toBeTruthy()

    const second = await initUpload('renamed.bin', content.byteLength, manifest, first.dedupToken)
    expect(second.instantUpload).toBe(true)
    expect(second.code).not.toBe(first.code)
    expect(second.file_name).toBe('renamed.bin')
    expect(second.dedupToken).toBeTruthy()

    const secondDownload = await resolveAndDownload(second.code)
    expect(secondDownload.data).toMatchObject({
      file_name: 'renamed.bin',
      size_bytes: content.byteLength,
    })
    expect(secondDownload.bytes).toEqual(content)
    const firstDownload = await resolveAndDownload(first.code)
    expect(firstDownload.data.file_name).toBe('first.bin')
    expect(firstDownload.bytes).toEqual(content)

    const shares = await env.DB.prepare(`
      SELECT id, code_hash, r2_key, display_name, blob_id
      FROM shares ORDER BY created_at ASC
    `).all<{
      id: string
      code_hash: string
      r2_key: string
      display_name: string
      blob_id: string
    }>()
    expect(shares.results).toHaveLength(2)
    expect(new Set(shares.results.map((share) => share.code_hash)).size).toBe(2)
    expect(new Set(shares.results.map((share) => share.r2_key)).size).toBe(1)
    expect(new Set(shares.results.map((share) => share.blob_id)).size).toBe(1)
    expect(shares.results.map((share) => share.display_name).sort()).toEqual(['first.bin', 'renamed.bin'])

    const blobs = await env.DB.prepare(`SELECT * FROM file_blobs WHERE status = 'active'`).all()
    expect(blobs.results).toHaveLength(1)
    const usage = await env.DB.prepare('SELECT active_bytes FROM storage_usage WHERE id = 1')
      .first<{ active_bytes: number }>()
    expect(usage?.active_bytes).toBe(content.byteLength)
    expect((await env.BUCKET.list()).objects).toHaveLength(1)

    const firstShare = shares.results.find((share) => share.display_name === 'first.bin')
    if (!firstShare) throw new Error('Expected the first independent share')
    await env.DB.prepare('UPDATE shares SET deleted_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), firstShare.id)
      .run()
    await expect(env.DB.prepare('SELECT status FROM file_blobs WHERE id = ?')
      .bind(firstShare.blob_id)
      .first<{ status: string }>()).resolves.toEqual({ status: 'active' })
    expect((await resolveAndDownload(second.code)).bytes).toEqual(content)
  })

  it('verifies and instantly reuses a real two-part upload', async () => {
    const content = new Uint8Array(CONTENT_FINGERPRINT_PART_SIZE + 1)
    content[0] = 0x52
    content[CONTENT_FINGERPRINT_PART_SIZE - 1] = 0x32
    content[CONTENT_FINGERPRINT_PART_SIZE] = 0x35
    const manifest = await contentManifest(content)
    const first = await initUpload('two-part.bin', content.byteLength, manifest)
    expect(first.partCount).toBe(2)
    expect(first.partSize).toBe(CONTENT_FINGERPRINT_PART_SIZE)

    const firstPart = await uploadPart(
      first,
      content.slice(0, CONTENT_FINGERPRINT_PART_SIZE),
      1,
    )
    const secondPart = await uploadPart(
      first,
      content.slice(CONTENT_FINGERPRINT_PART_SIZE),
      2,
    )
    const completedResponse = await completeRequest(first, [firstPart, secondPart])
    expect(completedResponse.status).toBe(200)
    const completed = await completedResponse.json<{ data: UploadInitData }>()
    expect(completed.data.dedupToken).toBeTruthy()

    const instant = await initUpload(
      'two-part-copy.bin',
      content.byteLength,
      manifest,
      completed.data.dedupToken,
    )
    expect(instant.instantUpload).toBe(true)
    const downloaded = await resolveAndDownload(instant.code)
    expect(downloaded.data.file_name).toBe('two-part-copy.bin')
    expect(downloaded.bytes).toEqual(content)
  }, 30_000)

  it('does not expose a hash-only lookup without the prior capability', async () => {
    const content = new TextEncoder().encode('capability protected bytes')
    const manifest = await contentManifest(content)
    await completeUpload('protected.bin', content, manifest)

    const withoutCapability = await initUpload('probe.bin', content.byteLength, manifest)
    expect(withoutCapability.instantUpload).toBe(false)
    expect(withoutCapability.uploadToken).toBeTruthy()

    const aborted = await SELF.fetch('https://example.test/api/share/file/abort', {
      method: 'POST',
      headers: { 'X-Upload-Token': withoutCapability.uploadToken || '' },
    })
    expect(aborted.status).toBe(200)
  })

  it('completes a pre-2.5 upload without fingerprints or signed receipts', async () => {
    const content = new TextEncoder().encode('legacy multipart client')
    const initResponse = await SELF.fetch('https://example.test/api/share/file/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'legacy.bin',
        mimeType: 'application/octet-stream',
        size: content.byteLength,
        expire_value: 1,
        expire_style: 'day',
      }),
    })
    expect(initResponse.status).toBe(200)
    const { data: init } = await initResponse.json<{ data: UploadInitData }>()
    const part = await uploadPart(init, content)
    const completed = await SELF.fetch('https://example.test/api/share/file/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Token': init.uploadToken || '',
      },
      body: JSON.stringify({
        code: init.code,
        parts: [{ partNumber: part.partNumber, etag: part.etag }],
      }),
    })
    expect(completed.status).toBe(200)

    const share = await env.DB.prepare(`
      SELECT shares.blob_id, blobs.status, blobs.fingerprint_algorithm
      FROM shares
      JOIN file_blobs AS blobs ON blobs.id = shares.blob_id
      WHERE shares.display_name = 'legacy.bin'
    `).first<{
      blob_id: string
      status: string
      fingerprint_algorithm: string | null
    }>()
    expect(share).toMatchObject({
      status: 'active',
      fingerprint_algorithm: null,
    })
    expect(share?.blob_id).toMatch(/^legacy-/)
    expect(await env.DB.prepare('SELECT count(*) AS count FROM upload_sessions')
      .first<number>('count')).toBe(0)
    expect(await env.DB.prepare('SELECT active_bytes FROM storage_usage WHERE id = 1')
      .first<number>('active_bytes')).toBe(content.byteLength)
  })

  it('collapses concurrent first uploads to one canonical blob and tracks the loser', async () => {
    const content = new TextEncoder().encode('concurrent canonical bytes')
    const manifest = await contentManifest(content)
    const firstInit = await initUpload('concurrent-a.bin', content.byteLength, manifest)
    const secondInit = await initUpload('concurrent-b.bin', content.byteLength, manifest)
    const [firstPart, secondPart] = await Promise.all([
      uploadPart(firstInit, content),
      uploadPart(secondInit, content),
    ])

    const [firstComplete, secondComplete] = await Promise.all([
      completeRequest(firstInit, [firstPart]),
      completeRequest(secondInit, [secondPart]),
    ])
    expect(firstComplete.status).toBe(200)
    expect(secondComplete.status).toBe(200)

    await eventually(async () => {
      const blobs = await env.DB.prepare(`SELECT status FROM file_blobs`).all<{ status: string }>()
      const objects = await env.BUCKET.list()
      return blobs.results.length === 1 &&
        blobs.results[0]?.status === 'active' &&
        objects.objects.length === 1
    })
    const shares = await env.DB.prepare('SELECT r2_key, blob_id FROM shares').all<{
      r2_key: string
      blob_id: string
    }>()
    expect(shares.results).toHaveLength(2)
    expect(new Set(shares.results.map((share) => share.r2_key)).size).toBe(1)
    expect(new Set(shares.results.map((share) => share.blob_id)).size).toBe(1)
  })

  it('rejects a claimed root that does not match the server-verified parts', async () => {
    const content = new TextEncoder().encode('server verified content')
    const actualManifest = await contentManifest(content)
    const claimedManifest = {
      ...actualManifest,
      fingerprint: '0'.repeat(64),
    }
    const init = await initUpload('forged.bin', content.byteLength, claimedManifest)
    const part = await uploadPart(init, content)
    const complete = await completeRequest(init, [part])

    expect(complete.status).toBe(400)
    await expect(complete.json()).resolves.toMatchObject({
      error_code: 'api.share.contentFingerprintMismatch',
    })
    const counts = await env.DB.prepare(`
      SELECT
        (SELECT count(*) FROM shares) AS shares,
        (SELECT count(*) FROM upload_sessions) AS sessions,
        (SELECT count(*) FROM file_blobs) AS blobs
    `).first<{ shares: number, sessions: number, blobs: number }>()
    expect(counts).toEqual({ shares: 0, sessions: 0, blobs: 0 })
  })

  it('rejects a tampered receipt but allows a retry with the signed receipt', async () => {
    const content = new TextEncoder().encode('receipt integrity')
    const manifest = await contentManifest(content)
    const init = await initUpload('receipt.bin', content.byteLength, manifest)
    const part = await uploadPart(init, content)
    const [receiptHeader, receiptPayload, receiptSignature] = part.receipt.split('.')
    const firstSignatureCharacter = receiptSignature?.[0]
    const tampered = {
      ...part,
      receipt: `${receiptHeader}.${receiptPayload}.${firstSignatureCharacter === 'A' ? 'B' : 'A'}${receiptSignature.slice(1)}`,
    }

    const rejected = await completeRequest(init, [tampered])
    expect(rejected.status).toBe(400)
    expect(await env.DB.prepare('SELECT count(*) AS count FROM upload_sessions')
      .first<{ count: number }>('count')).toBe(1)

    const retried = await completeRequest(init, [part])
    expect(retried.status).toBe(200)
  })

  it('treats concurrent completion requests for one verified session as idempotent', async () => {
    const content = new TextEncoder().encode('same session completion race')
    const manifest = await contentManifest(content)
    const init = await initUpload('same-session.bin', content.byteLength, manifest)
    const part = await uploadPart(init, content)

    const responses = await Promise.all([
      completeRequest(init, [part]),
      completeRequest(init, [part]),
    ])
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    const counts = await env.DB.prepare(`
      SELECT
        (SELECT count(*) FROM shares) AS shares,
        (SELECT count(*) FROM file_blobs) AS blobs,
        (SELECT count(*) FROM upload_sessions) AS sessions
    `).first<{ shares: number, blobs: number, sessions: number }>()
    expect(counts).toEqual({ shares: 1, blobs: 1, sessions: 0 })
    expect((await env.BUCKET.list()).objects).toHaveLength(1)
  })

  it('recovers when R2 completes before the first D1 completion batch succeeds', async () => {
    const content = new TextEncoder().encode('recover completed R2 object')
    const manifest = await contentManifest(content)
    const init = await initUpload('recover.bin', content.byteLength, manifest)
    const part = await uploadPart(init, content)
    let failBatch = true
    const failingDb = new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === 'batch') {
          return async (statements: D1PreparedStatement[]) => {
            if (failBatch) {
              throw new Error('injected D1 completion failure')
            }
            return target.batch(statements)
          }
        }
        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const failingEnv = new Proxy(env, {
      get(target, property, receiver) {
        if (property === 'DB') return failingDb
        return Reflect.get(target, property, receiver)
      },
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const failed = await worker.fetch(
        completeRequestObject(init, [part]),
        failingEnv,
        createExecutionContext(),
      )
      expect(failed.status).toBe(500)

      const abort = await worker.fetch(
        new Request('https://example.test/api/share/file/abort', {
          method: 'POST',
          headers: { 'X-Upload-Token': init.uploadToken || '' },
        }),
        failingEnv,
        createExecutionContext(),
      )
      expect(abort.status).toBe(500)
    } finally {
      failBatch = false
      errorSpy.mockRestore()
    }

    const retained = await env.DB.prepare(`
      SELECT
        (SELECT count(*) FROM shares) AS shares,
        (SELECT count(*) FROM file_blobs) AS blobs,
        (SELECT count(*) FROM upload_sessions) AS sessions,
        (SELECT active_bytes FROM storage_usage WHERE id = 1) AS active_bytes
    `).first<{
      shares: number
      blobs: number
      sessions: number
      active_bytes: number
    }>()
    expect(retained).toEqual({
      shares: 0,
      blobs: 0,
      sessions: 1,
      active_bytes: content.byteLength,
    })
    expect((await env.BUCKET.list()).objects).toHaveLength(1)

    const retried = await completeRequest(init, [part])
    expect(retried.status).toBe(200)
    const state = await env.DB.prepare(`
      SELECT
        (SELECT count(*) FROM shares) AS shares,
        (SELECT count(*) FROM file_blobs WHERE status = 'active') AS active_blobs,
        (SELECT count(*) FROM upload_sessions) AS sessions,
        (SELECT active_bytes FROM storage_usage WHERE id = 1) AS active_bytes
    `).first<{
      shares: number
      active_blobs: number
      sessions: number
      active_bytes: number
    }>()
    expect(state).toEqual({
      shares: 1,
      active_blobs: 1,
      sessions: 0,
      active_bytes: content.byteLength,
    })
    expect((await env.BUCKET.list()).objects).toHaveLength(1)
  })
})

async function contentManifest(content: Uint8Array) {
  const partSha256: string[] = []
  for (let offset = 0; offset < content.byteLength; offset += CONTENT_FINGERPRINT_PART_SIZE) {
    partSha256.push(await sha256Bytes(
      content.slice(offset, Math.min(offset + CONTENT_FINGERPRINT_PART_SIZE, content.byteLength)),
    ))
  }
  return {
    algorithm: CONTENT_FINGERPRINT_ALGORITHM,
    fingerprint: await deriveContentFingerprint(content.byteLength, partSha256),
  }
}

async function initUpload(
  filename: string,
  size: number,
  manifest: { algorithm: string, fingerprint: string },
  dedupToken?: string,
): Promise<UploadInitData> {
  const response = await SELF.fetch('https://example.test/api/share/file/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename,
      mimeType: 'application/octet-stream',
      size,
      expire_value: 1,
      expire_style: 'day',
      fingerprintAlgorithm: manifest.algorithm,
      contentFingerprint: manifest.fingerprint,
      dedupToken,
    }),
  })
  expect(response.status).toBe(200)
  const body = await response.json<{ data: UploadInitData }>()
  return body.data
}

async function uploadPart(
  init: UploadInitData,
  content: Uint8Array,
  partNumber: number = 1,
): Promise<PartData> {
  const response = await SELF.fetch('https://example.test/api/share/file/part', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(content.byteLength),
      'X-Upload-Token': init.uploadToken || '',
      'X-Part-Number': String(partNumber),
    },
    body: content,
  })
  expect(response.status).toBe(200)
  const body = await response.json<{ data: PartData }>()
  return body.data
}

async function completeRequest(init: UploadInitData, parts: PartData[]): Promise<Response> {
  return await SELF.fetch(completeRequestObject(init, parts))
}

function completeRequestObject(init: UploadInitData, parts: PartData[]): Request {
  return new Request('https://example.test/api/share/file/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Token': init.uploadToken || '',
    },
    body: JSON.stringify({
      code: init.code,
      parts: parts.map((part) => ({
        partNumber: part.partNumber,
        etag: part.etag,
        receipt: part.receipt,
      })),
    }),
  })
}

async function completeUpload(
  filename: string,
  content: Uint8Array,
  manifest: { algorithm: string, fingerprint: string },
): Promise<UploadInitData> {
  const init = await initUpload(filename, content.byteLength, manifest)
  const part = await uploadPart(init, content)
  const response = await completeRequest(init, [part])
  expect(response.status).toBe(200)
  const body = await response.json<{ data: UploadInitData }>()
  return body.data
}

async function resolveAndDownload(code: string): Promise<{
  data: { file_name: string, size_bytes: number, download_url: string }
  bytes: Uint8Array
}> {
  const resolved = await SELF.fetch('https://example.test/api/share/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  expect(resolved.status).toBe(200)
  const downloadCookie = resolved.headers.get('Set-Cookie')?.split(';', 1)[0]
  const body = await resolved.json<{
    data: { file_name: string, size_bytes: number, download_url: string }
  }>()
  expect(downloadCookie).toBeTruthy()
  const downloaded = await SELF.fetch(`https://example.test${body.data.download_url}`, {
    headers: { Cookie: downloadCookie || '' },
  })
  expect(downloaded.status).toBe(200)
  return {
    data: body.data,
    bytes: new Uint8Array(await downloaded.arrayBuffer()),
  }
}

async function eventually(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await check()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
  }
  expect(await check()).toBe(true)
}
