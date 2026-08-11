import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AuditSubject, Env, Share, UploadSession } from '../types'
import { success, error } from '../lib/response'
import { ErrorCode } from '../types/errors'
import { generateCode, hashCode, hashIp } from '../lib/code'
import {
  calculateExpireAt,
  contentDispositionAttachment,
  contentDispositionInline,
  sanitizeFilename,
  sanitizeMimeType,
} from '../lib/validators'
import { DB } from '../lib/db'
import { R2Storage, generateR2Key } from '../lib/r2'
import { getRequiredSecret } from '../lib/env'
import { getClientIp } from '../lib/security'
import { signJWT, verifyJWT } from '../lib/auth'
import {
  getRuntimeConfig,
  RuntimeConfigUnavailableError,
  type RuntimeConfig,
} from '../lib/runtime-config'
import { checkRateLimit } from '../lib/rate-limit'
import { BodyTooLargeError, InvalidBodyError, readStructuredBody } from '../lib/body'
import { recordMetric } from '../lib/metrics'

type Bindings = Env

const app = new Hono<{ Bindings: Bindings }>()
const MULTIPART_PART_SIZE = 8 * 1024 * 1024
const MAX_TEXT_BYTES = 1024 * 1024
const MAX_TEXT_REQUEST_BYTES = MAX_TEXT_BYTES + (64 * 1024)
const MAX_INIT_BODY_BYTES = 16 * 1024
const MAX_COMPLETE_BODY_BYTES = 8 * 1024
const MAX_RESOLVE_BODY_BYTES = 4 * 1024
const MAX_MULTIPART_PARTS = 12
const DOWNLOAD_SESSION_TTL_SECONDS = 15 * 60

interface UploadTokenPayload extends Record<string, unknown> {
  purpose: 'multipart-upload'
  session_id: string
  share_id: string
  upload_id: string
  code_hash: string
  r2_key: string
}

app.post('/api/share/text', createTextShare)
app.post('/api/share/file/init', initMultipartFileShare)
app.put('/api/share/file/part', uploadMultipartPart)
app.post('/api/share/file/complete', completeMultipartFileShare)
app.post('/api/share/file/abort', abortMultipartFileShare)
app.post('/api/share/resolve', resolveShareFromBody)
app.get('/api/share/download/:shareId', downloadWithSession)

async function createTextShare(c: Context<{ Bindings: Bindings }>) {
  try {
    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)
    if (!config.enablePublicUpload || !config.enableTextShare) {
      return c.json(error(ErrorCode.TEXT_SHARE_DISABLED, 403, 'Text sharing is disabled by administrator'), 403)
    }

    const maxUploadBytes = Math.min(config.maxUploadBytes, MAX_TEXT_BYTES)
    const contentLength = getContentLength(c)
    if (contentLength && contentLength > MAX_TEXT_REQUEST_BYTES) {
      return c.json(error(ErrorCode.PAYLOAD_TOO_LARGE, 413, 'Payload too large'), 413)
    }

    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    getRequiredSecret(c.env, 'SESSION_SECRET')
    const ipHash = await hashIp(getClientIp(c), pepper)
    const limited = await checkRateLimit(
      c.env,
      db,
      'upload',
      ipHash,
      60,
      config.rateLimitUploadPerMinute,
      config.enableNativeRateLimit,
    )
    if (limited.limited) {
      return rateLimited(c, limited.resetAt)
    }

    const body = await readStructuredBody(c.req.raw, MAX_TEXT_REQUEST_BYTES)
    if (!await verifyTurnstileIfRequired(c, body, config, 'text-share')) {
      return c.json(error(ErrorCode.TURNSTILE_FAILED, 403, 'Turnstile verification failed'), 403)
    }
    const text = typeof body.text === 'string' ? body.text : ''
    if (!text.trim()) {
      return c.json(error(ErrorCode.TEXT_CONTENT_EMPTY, 400, 'Text content cannot be empty'), 400)
    }

    const textBytes = new TextEncoder().encode(text)
    if (textBytes.length > maxUploadBytes) {
      return c.json(error(ErrorCode.PAYLOAD_TOO_LARGE, 413, 'Payload too large'), 413)
    }

    const codeLength = config.codeLength
    const rawCode = generateCode(codeLength)
    const codeHash = await hashCode(rawCode, pepper)
    const shareId = crypto.randomUUID()
    const r2Key = generateR2Key(shareId)
    const expireAt = getExpireAt(config, body)
    const maxDownloads = getMaxDownloads(config)

    const r2 = new R2Storage(c.env.BUCKET)
    const uploaded = await r2.uploadFile(
      r2Key,
      new Blob([text], { type: 'text/plain; charset=utf-8' }),
      {
        httpMetadata: {
          contentType: 'text/plain; charset=utf-8',
          contentDisposition: contentDispositionAttachment('text.txt'),
        },
      },
    )
    if (!uploaded) {
      return c.json(error(ErrorCode.STORAGE_WRITE_FAILED, 500, 'Failed to write to storage'), 500)
    }

    const now = new Date().toISOString()
    try {
      const created = await db.createShare({
        id: shareId,
        code_hash: codeHash,
        type: 'text',
        r2_key: r2Key,
        display_name: 'text.txt',
        mime_type: 'text/plain; charset=utf-8',
        size_bytes: textBytes.length,
        title: typeof body.title === 'string' ? body.title.slice(0, 200) : 'Untitled text',
        created_at: now,
        expire_at: expireAt,
        deleted_at: null,
        max_downloads: maxDownloads,
        download_count: 0,
        created_ip_hash: ipHash,
        last_access_at: null,
        object_etag: uploaded.etag,
        object_uploaded_at: now,
      }, config.maxTotalStorageBytes)
      if (!created) {
        await Promise.allSettled([r2.deleteObject(r2Key)])
        return c.json(error(ErrorCode.STORAGE_LIMIT_REACHED, 403, 'Storage soft limit reached'), 403)
      }
    } catch (error) {
      await Promise.allSettled([r2.deleteObject(r2Key)])
      throw error
    }

    const url = `${new URL(c.req.url).origin}/#/share/${rawCode}`
    await audit(db, c, 'share_text_create', shareId, 'success', ipHash, {
      config,
      subject: { type: 'text', name: 'text.txt', sizeBytes: textBytes.length },
    })
    recordMetric(c.env, {
      event: 'share_text_create',
      status: 'success',
      subjectType: 'text',
      sizeBytes: textBytes.length,
    })

    return c.json(success({
      code: rawCode,
      share_url: `/share/${rawCode}`,
      full_share_url: url,
      qr_code_data: url,
      expire_at: expireAt,
      max_downloads: maxDownloads,
    }, 'Share created'))
  } catch (e: unknown) {
    return routeFailure(c, 'create text share', e, 'Could not create share')
  }
}

async function initMultipartFileShare(c: Context<{ Bindings: Bindings }>) {
  try {
    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)
    if (!config.enablePublicUpload || !config.enableFileShare) {
      return c.json(error(ErrorCode.FILE_SHARE_DISABLED, 403, 'File sharing is disabled by administrator'), 403)
    }

    const maxUploadBytes = config.maxUploadBytes
    const body = await readStructuredBody(c.req.raw, MAX_INIT_BODY_BYTES)
    const sizeBytes = Number.parseInt(String(body.size || '0'), 10)
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return c.json(error(ErrorCode.INVALID_FILE_SIZE, 400, 'Invalid file size'), 400)
    }
    const maxMb = Math.floor(maxUploadBytes / 1024 / 1024)
    if (sizeBytes > maxUploadBytes) {
      return c.json(error(ErrorCode.FILE_TOO_LARGE, 413, `File is too large, maximum allowed is ${maxMb}MB`, { max: maxMb }), 413)
    }
    
    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    getRequiredSecret(c.env, 'SESSION_SECRET')
    const ipHash = await hashIp(getClientIp(c), pepper)
    const limited = await checkRateLimit(
      c.env,
      db,
      'upload',
      ipHash,
      60,
      config.rateLimitUploadPerMinute,
      config.enableNativeRateLimit,
    )
    if (limited.limited) {
      return rateLimited(c, limited.resetAt)
    }
    if (!await verifyTurnstileIfRequired(c, body, config, 'file-share')) {
      return c.json(error(ErrorCode.TURNSTILE_FAILED, 403, 'Turnstile verification failed'), 403)
    }

    const maxStorage = config.maxTotalStorageBytes

    const safeFilename = sanitizeFilename(String(body.filename || 'upload.bin'))
    const mimeType = sanitizeMimeType(String(body.mimeType || 'application/octet-stream'))
    const codeLength = config.codeLength
    const rawCode = generateCode(codeLength)
    const codeHash = await hashCode(rawCode, pepper)
    const shareId = crypto.randomUUID()
    const r2Key = generateR2Key(shareId)
    const expireAt = getExpireAt(config, body)
    const maxDownloads = getMaxDownloads(config)

    const r2 = new R2Storage(c.env.BUCKET)
    const multipart = await r2.createMultipartUpload(r2Key, {
      httpMetadata: {
        contentType: mimeType,
        contentDisposition: contentDispositionAttachment(safeFilename),
      },
    })
    const now = new Date().toISOString()
    const sessionId = crypto.randomUUID()
    const session: UploadSession = {
      id: sessionId,
      share_id: shareId,
      upload_id: multipart.uploadId,
      code_hash: codeHash,
      r2_key: r2Key,
      display_name: safeFilename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      title: null,
      expire_at: expireAt,
      max_downloads: maxDownloads,
      created_ip_hash: ipHash,
      created_at: now,
      updated_at: now,
    }
    let reserved = false
    try {
      reserved = await db.createUploadSession(session, maxStorage)
    } catch (error) {
      await Promise.allSettled([multipart.abort()])
      throw error
    }
    if (!reserved) {
      await Promise.allSettled([multipart.abort()])
      return c.json(error(ErrorCode.STORAGE_LIMIT_REACHED, 403, 'Storage soft limit reached'), 403)
    }

    const uploadToken = await signUploadToken(c.env, session)
    const partCount = Math.ceil(sizeBytes / MULTIPART_PART_SIZE)
    await audit(db, c, 'multipart_file_init', shareId, 'success', ipHash, {
      config,
      subject: { type: 'file', name: safeFilename, sizeBytes },
    })

    return c.json(success({
      uploadToken,
      code: rawCode,
      partSize: MULTIPART_PART_SIZE,
      partCount,
    }, 'Upload session created'))
  } catch (e: unknown) {
    return routeFailure(c, 'initialize multipart upload', e, 'Could not initialize upload')
  }
}

async function uploadMultipartPart(c: Context<{ Bindings: Bindings }>) {
  try {
    const uploadToken = c.req.header('X-Upload-Token')
    if (!uploadToken) {
      return c.json(error(ErrorCode.INVALID_UPLOAD_SESSION, 401, 'Invalid upload session'), 401)
    }
    const rawPartNumber = c.req.header('X-Part-Number')
    const partNumber = Number.parseInt(rawPartNumber || '', 10)
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_MULTIPART_PARTS) {
      return c.json(error(ErrorCode.INVALID_PART_NUMBER, 400, 'Invalid part number'), 400)
    }
    const payload = await verifyUploadToken(c, uploadToken)
    if (!payload) {
      return c.json(error(ErrorCode.INVALID_UPLOAD_SESSION, 401, 'Invalid upload session'), 401)
    }

    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    const ipHash = await hashIp(getClientIp(c), pepper)
    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)
    const limited = await checkRateLimit(
      c.env,
      db,
      'upload_part',
      ipHash,
      60,
      config.rateLimitUploadPartPerMinute,
      config.enableNativeRateLimit,
    )
    if (limited.limited) {
      return rateLimited(c, limited.resetAt)
    }

    // R2 resumeMultipartUpload() deliberately does not validate the upload ID.
    // Maintain the D1 session read so that cancellation, cleanup, and configured expiry
    // take effect before accepting another paid R2 part operation.
    const session = await db.getUploadSession(payload.session_id)
    if (
      !session ||
      session.share_id !== payload.share_id ||
      session.upload_id !== payload.upload_id ||
      session.r2_key !== payload.r2_key ||
      session.code_hash !== payload.code_hash
    ) {
      return c.json(error(ErrorCode.UPLOAD_SESSION_NOT_FOUND, 404, 'Upload session not found'), 404)
    }
    const r2 = new R2Storage(c.env.BUCKET)
    if (isExpiredIso(session.expire_at)) {
      await abortUploadSession(r2, db, session)
      return c.json(error(ErrorCode.UPLOAD_SESSION_EXPIRED, 410, 'Upload session expired, please upload again'), 410)
    }

    const partCount = Math.ceil(session.size_bytes / MULTIPART_PART_SIZE)
    if (partNumber > partCount) {
      return c.json(error(ErrorCode.INVALID_PART_NUMBER, 400, 'Invalid part number'), 400)
    }
    const expectedBytes = partNumber === partCount
      ? session.size_bytes - ((partCount - 1) * MULTIPART_PART_SIZE)
      : MULTIPART_PART_SIZE
    const contentLength = getContentLength(c)
    if (contentLength !== null && contentLength !== expectedBytes) {
      return c.json(
        error(
          contentLength > expectedBytes ? ErrorCode.PART_TOO_LARGE : ErrorCode.PART_INCOMPLETE_RETRY,
          contentLength > expectedBytes ? 413 : 400,
          contentLength > expectedBytes ? 'Part is too large' : 'Incomplete part size'
        ),
        contentLength > expectedBytes ? 413 : 400
      )
    }

    if (!c.req.raw.body) {
      return c.json(error(ErrorCode.MISSING_PART_CONTENT, 400, 'Missing part content'), 400)
    }

    const guarded = fixedLengthPartStream(c.req.raw.body, expectedBytes)
    const multipart = r2.resumeMultipartUpload(session.r2_key, session.upload_id)
    const [uploadResult, pipeResult] = await Promise.allSettled([
      multipart.uploadPart(partNumber, guarded.readable),
      guarded.pipePromise,
    ])
    if (guarded.bytesRead() > expectedBytes) {
      throw new BodyTooLargeError()
    }
    if (guarded.sourceCompleted() && guarded.bytesRead() < expectedBytes) {
      await abortUploadSession(r2, db, session)
      return c.json(error(ErrorCode.PART_INCOMPLETE_RETRY, 400, 'Incomplete part size, please upload again'), 400)
    }
    if (uploadResult.status === 'rejected') throw uploadResult.reason
    if (pipeResult.status === 'rejected') throw pipeResult.reason
    return c.json(success(uploadResult.value))
  } catch (e: unknown) {
    return routeFailure(c, 'upload multipart part', e, 'Could not upload part')
  }
}

async function completeMultipartFileShare(c: Context<{ Bindings: Bindings }>) {
  try {
    const payload = await verifyUploadToken(c)
    if (!payload) {
      return c.json(error(ErrorCode.INVALID_UPLOAD_SESSION, 401, 'Invalid upload session'), 401)
    }
    const body = await readStructuredBody(c.req.raw, MAX_COMPLETE_BODY_BYTES)
    const code = String(body.code || '')
    if (!Array.isArray(body.parts) || body.parts.length > MAX_MULTIPART_PARTS) {
      return c.json(error(ErrorCode.INVALID_COMPLETE_INFO, 400, 'Invalid completion info'), 400)
    }
    const parts = normalizeUploadedParts(body.parts)
    if (!parts.length) {
      return c.json(error(ErrorCode.MISSING_COMPLETE_INFO, 400, 'Missing completion info'), 400)
    }

    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    const requestIpHash = await hashIp(getClientIp(c), pepper)
    if (await hashCode(code, pepper) !== payload.code_hash) {
      return c.json(error(ErrorCode.INVALID_UPLOAD_SESSION, 401, 'Invalid upload session token'), 401)
    }

    const db = new DB(c.env.DB)
    const session = await db.getUploadSession(payload.session_id)
    if (!session) {
      const completedShare = await db.getShareById(payload.share_id)
      if (
        completedShare?.type === 'file' &&
        completedShare.code_hash === payload.code_hash &&
        completedShare.r2_key === payload.r2_key
      ) {
        return completedUploadResponse(c, code, completedShare)
      }
      return c.json(error(ErrorCode.UPLOAD_SESSION_NOT_FOUND, 404, 'Upload session not found'), 404)
    }
    if (
      session.share_id !== payload.share_id ||
      session.upload_id !== payload.upload_id ||
      session.r2_key !== payload.r2_key ||
      session.code_hash !== payload.code_hash
    ) {
      return c.json(error(ErrorCode.UPLOAD_SESSION_NOT_FOUND, 404, 'Upload session not found'), 404)
    }

    const r2 = new R2Storage(c.env.BUCKET)
    if (isExpiredIso(session.expire_at)) {
      await abortUploadSession(r2, db, session)
      return c.json(error(ErrorCode.UPLOAD_SESSION_EXPIRED, 410, 'Upload session expired, please upload again'), 410)
    }

    const expectedPartCount = Math.ceil(session.size_bytes / MULTIPART_PART_SIZE)
    if (
      parts.length !== expectedPartCount ||
      parts.some((part, index) => part.partNumber !== index + 1)
    ) {
      return c.json(error(ErrorCode.INCOMPLETE_COMPLETE_INFO, 400, 'Incomplete multipart upload completion info'), 400)
    }

    const multipart = r2.resumeMultipartUpload(session.r2_key, session.upload_id)
    let uploaded: R2Object
    try {
      uploaded = await multipart.complete(parts)
    } catch (completeError) {
      // If the isolate stopped after R2 completed but before D1 committed, the
      // multipart upload no longer exists. Recover from the final object.
      const existing = await r2.headObject(session.r2_key)
      if (!existing || existing.size !== session.size_bytes) throw completeError
      uploaded = existing
    }
    if (uploaded.size !== session.size_bytes) {
      await r2.deleteObject(session.r2_key)
      await db.deleteUploadSession(session.id)
      await audit(db, c, 'multipart_file_size_mismatch', session.share_id, 'failed', requestIpHash, {
        subject: { type: 'file', name: session.display_name, sizeBytes: session.size_bytes },
      })
      return c.json(error(ErrorCode.SIZE_MISMATCH, 400, 'File size mismatch validation failed'), 400)
    }

    const now = new Date().toISOString()
    const completedShare: Share = {
      id: session.share_id,
      code_hash: session.code_hash,
      type: 'file',
      r2_key: session.r2_key,
      display_name: session.display_name,
      mime_type: session.mime_type,
      size_bytes: session.size_bytes,
      title: session.title,
      created_at: now,
      expire_at: session.expire_at,
      deleted_at: null,
      max_downloads: session.max_downloads,
      download_count: 0,
      created_ip_hash: session.created_ip_hash,
      last_access_at: null,
      object_etag: uploaded.etag,
      object_uploaded_at: now,
    }
    let persistedShare = completedShare
    let newlyPersisted = true
    try {
      await db.completeUploadSession(completedShare, session)
    } catch (databaseError) {
      // Repair the state produced by versions that inserted the share and
      // deleted the upload session in separate D1 operations.
      const existing = await db.getShareById(session.share_id).catch(() => null)
      if (
        !existing ||
        existing.type !== 'file' ||
        existing.code_hash !== session.code_hash ||
        existing.r2_key !== session.r2_key
      ) {
        throw databaseError
      }
      await db.deleteUploadSession(session.id)
      persistedShare = existing
      newlyPersisted = false
    }

    if (newlyPersisted) {
      await audit(db, c, 'multipart_file_complete', session.share_id, 'success', requestIpHash, {
        subject: { type: 'file', name: session.display_name, sizeBytes: session.size_bytes },
      })
    }
    return completedUploadResponse(c, code, persistedShare)
  } catch (e: unknown) {
    return routeFailure(c, 'complete multipart upload', e, 'Could not complete upload')
  }
}

async function abortMultipartFileShare(c: Context<{ Bindings: Bindings }>) {
  try {
    const payload = await verifyUploadToken(c)
    if (!payload) {
      return c.json(error(ErrorCode.INVALID_UPLOAD_SESSION, 401, 'Invalid upload session'), 401)
    }
    const db = new DB(c.env.DB)
    const session = await db.getUploadSession(payload.session_id)
    if (!session) {
      return c.json(success(null, 'Upload session already ended'))
    }
    const r2 = new R2Storage(c.env.BUCKET)
    await abortUploadSession(r2, db, session)
    return c.json(success(null, 'Upload cancelled'))
  } catch (e: unknown) {
    return routeFailure(c, 'abort multipart upload', e, 'Could not cancel upload')
  }
}



function completedUploadResponse(c: Context, code: string, share: Share) {
  const url = `${new URL(c.req.url).origin}/#/share/${code}`
  return c.json(success({
    code,
    share_url: `/share/${code}`,
    full_share_url: url,
    qr_code_data: url,
    file_name: share.display_name,
    size_bytes: share.size_bytes,
    expire_at: share.expire_at,
    max_downloads: share.max_downloads,
  }, 'File uploaded'))
}

async function resolveShareFromBody(c: Context<{ Bindings: Bindings }>) {
  try {
    const body = await readStructuredBody(c.req.raw, MAX_RESOLVE_BODY_BYTES)
    return resolveShare(c, typeof body.code === 'string' ? body.code : undefined)
  } catch (e) {
    return routeFailure(c, 'parse share resolve request', e, 'Invalid request format')
  }
}

async function resolveShare(c: Context<{ Bindings: Bindings }>, rawCode: string | undefined) {
  try {
    if (!rawCode || rawCode.length > 128 || !/^[23456789A-HJ-NP-Za-km-z]+$/.test(rawCode)) {
      return c.json(error(ErrorCode.SHARE_NOT_FOUND, 404, 'Share not found or expired'), 404)
    }

    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)
    const ipHash = await hashIp(getClientIp(c), pepper)
    const limited = await checkRateLimit(
      c.env,
      db,
      'resolve',
      ipHash,
      60,
      config.rateLimitResolvePerMinute,
      config.enableNativeRateLimit,
    )
    if (limited.limited) {
      return rateLimited(c, limited.resetAt)
    }

    const codeHash = await hashCode(rawCode, pepper)
    const share = await db.getShareByCodeHash(codeHash)

    if (!isShareAvailable(share)) {
      return c.json(error(ErrorCode.SHARE_NOT_FOUND, 404, 'Share not found or expired'), 404)
    }

    if (share.type === 'text') {
      // Reserve the extraction atomically before loading the R2 body. A
      // concurrent request that loses the final download slot must not read
      // text content that it is no longer allowed to return.
      if (!await db.consumeShareDownload(share.id)) {
        return c.json(error(ErrorCode.SHARE_NOT_FOUND, 404, 'Share not found or expired'), 404)
      }
      const r2 = new R2Storage(c.env.BUCKET)
      const obj = await r2.getObject(share.r2_key)
      if (!obj) {
        return c.json(error(ErrorCode.SHARE_NOT_FOUND, 404, 'Share not found or expired'), 404)
      }
      const text = await obj.text()
      await audit(db, c, 'share_resolve_text', share.id, 'success', ipHash, {
        accessLog: true,
        config,
        subject: shareAuditSubject(share),
      })
      return c.json(success({
        code: rawCode,
        type: 'text',
        text,
        size_bytes: share.size_bytes,
        expire_at: share.expire_at,
        download_count: share.download_count + 1,
        max_downloads: share.max_downloads,
      }))
    }

    const downloadLimited = await checkRateLimit(
      c.env,
      db,
      'download',
      ipHash,
      60,
      config.rateLimitDownloadPerMinute,
      config.enableNativeRateLimit,
    )
    if (downloadLimited.limited) {
      return rateLimited(c, downloadLimited.resetAt)
    }

    // Count one extraction as one logical download. The resulting short-lived
    // session can then serve all Range requests needed for playback or seeking
    // without consuming additional download slots or D1 writes.
    const r2 = new R2Storage(c.env.BUCKET)
    const storedObject = await r2.headObject(share.r2_key)
    if (!storedObject) {
      return c.json(error(ErrorCode.SHARE_NOT_FOUND, 404, 'Share not found or expired'), 404)
    }
    const sessionSecret = getRequiredSecret(c.env, 'SESSION_SECRET')
    if (!await db.consumeShareDownload(share.id)) {
      return c.json(error(ErrorCode.SHARE_NOT_FOUND, 404, 'Share not found or expired'), 404)
    }
    const token = await signJWT({
      purpose: 'download',
      share_id: share.id,
      exp: Math.floor(Date.now() / 1000) + DOWNLOAD_SESSION_TTL_SECONDS,
      nonce: crypto.randomUUID(),
    }, sessionSecret)
    const downloadUrl = `/api/share/download/${share.id}`
    c.header(
      'Set-Cookie',
      downloadSessionCookie(token, downloadUrl, c.req.url, DOWNLOAD_SESSION_TTL_SECONDS),
    )

    await audit(db, c, 'share_resolve_file', share.id, 'success', ipHash, {
      accessLog: true,
      config,
      subject: shareAuditSubject(share),
    })
    recordMetric(c.env, {
      event: 'download_file',
      status: 'success',
      subjectType: 'file',
      mimeType: share.mime_type || undefined,
      sizeBytes: share.size_bytes,
    })
    return c.json(success({
      code: rawCode,
      type: 'file',
      file_name: share.display_name || undefined,
      size_bytes: share.size_bytes,
      mime_type: share.mime_type,
      expire_at: share.expire_at,
      download_count: share.download_count + 1,
      max_downloads: share.max_downloads,
      download_url: downloadUrl,
    }))
  } catch (e: unknown) {
    return routeFailure(c, 'resolve share', e, 'Could not retrieve share')
  }
}

async function downloadWithSession(c: Context<{ Bindings: Bindings }>) {
  try {
    const shareId = c.req.param('shareId')
    const token = getCookieValue(c.req.header('Cookie') || '', 'download_session')
    if (!shareId || !token || !/^[0-9a-f-]{36}$/i.test(shareId)) {
      return new Response('Share code invalid or file unavailable', { status: 404 })
    }
    const payload = await verifyJWT(token, getRequiredSecret(c.env, 'SESSION_SECRET'))
    if (
      !payload ||
      payload.purpose !== 'download' ||
      typeof payload.share_id !== 'string' ||
      payload.share_id !== shareId
    ) {
      return new Response('Share code invalid or file unavailable', { status: 404 })
    }

    const db = new DB(c.env.DB)
    const share = await db.getShareById(shareId)
    if (!isDownloadSessionShareAvailable(share) || share.type !== 'file') {
      return new Response('Share code invalid or file unavailable', { status: 404 })
    }

    const ifNoneMatch = c.req.header('If-None-Match')
    const currentHttpEtag = share.object_etag ? toHttpEtag(share.object_etag) : null
    if (ifNoneMatch && currentHttpEtag && ifNoneMatchMatches(ifNoneMatch, currentHttpEtag)) {
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': 'private, no-store',
          ETag: currentHttpEtag,
        },
      })
    }

    const rangeHeader = c.req.header('Range')
    const r2Options: R2GetOptions | undefined = rangeHeader
      ? { range: c.req.raw.headers }
      : undefined

    const r2 = new R2Storage(c.env.BUCKET)
    const obj = await r2.getObject(share.r2_key, r2Options)
    if (!obj) {
      return new Response('Share code invalid or file unavailable', { status: 404 })
    }

    const headers = new Headers()
    obj.writeHttpMetadata(headers)
    headers.set('Content-Type', share.mime_type || 'application/octet-stream')
    const disposition = c.req.query('disposition') === 'inline' && isSafeInlinePreviewMime(share.mime_type)
      ? 'inline'
      : 'attachment'
    headers.set(
      'Content-Disposition',
      disposition === 'inline'
        ? contentDispositionInline(share.display_name || 'preview')
        : contentDispositionAttachment(share.display_name || 'download'),
    )
    headers.set('Cache-Control', 'private, no-store')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'no-referrer')
    headers.set('Accept-Ranges', 'bytes')
    headers.set('etag', obj.httpEtag)

    let status = 200
    if (rangeHeader && obj.range) {
      status = 206
      if ('offset' in obj.range && typeof obj.range.offset === 'number') {
        const offset = obj.range.offset
        const length = obj.range.length ?? (share.size_bytes - offset)
        const end = Math.min(offset + length - 1, share.size_bytes - 1)
        headers.set('Content-Range', `bytes ${offset}-${end}/${share.size_bytes}`)
        headers.set('Content-Length', String(end - offset + 1))
      } else if ('suffix' in obj.range && typeof obj.range.suffix === 'number') {
        const suffix = obj.range.suffix
        const start = Math.max(share.size_bytes - suffix, 0)
        const end = share.size_bytes - 1
        headers.set('Content-Range', `bytes ${start}-${end}/${share.size_bytes}`)
        headers.set('Content-Length', String(end - start + 1))
      }
    }

    return new Response(obj.body, { status, headers })
  } catch (e: unknown) {
    if (e instanceof RuntimeConfigUnavailableError) {
      console.error('download share failed:', e)
      return new Response('Service temporarily unavailable, please try again later', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    console.error('download share failed:', e)
    return new Response('Download failed', { status: 500 })
  }
}

function getCookieValue(cookieHeader: string, name: string): string | null {
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  if (!match) return null
  try {
    return decodeURIComponent(match.slice(name.length + 1))
  } catch {
    return null
  }
}

function downloadSessionCookie(token: string, path: string, requestUrl: string, maxAge: number): string {
  const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : ''
  return `download_session=${encodeURIComponent(token)}; HttpOnly${secure}; SameSite=Strict; Path=${path}; Max-Age=${maxAge}`
}

async function verifyTurnstileIfRequired(
  c: Context<{ Bindings: Bindings }>,
  body: Record<string, unknown>,
  config: RuntimeConfig,
  expectedAction: string,
): Promise<boolean> {
  if (!config.requireTurnstile) return true

  const token = body.turnstileToken || body['cf-turnstile-response']
  if (!token || typeof token !== 'string' || token.length > 2048) return false

  try {
    const form = new FormData()
    form.set('secret', getRequiredSecret(c.env, 'TURNSTILE_SECRET_KEY'))
    form.set('response', token)
    form.set('idempotency_key', crypto.randomUUID())
    const ip = getClientIp(c)
    if (ip) form.set('remoteip', ip)

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return false
    const result = await response.json<{ success?: boolean, hostname?: string, action?: string }>()
    if (result.success !== true || !result.hostname) return false
    if (!sameTurnstileHostname(result.hostname, new URL(c.req.url).hostname)) return false
    if (result.action !== expectedAction) return false
    return true
  } catch (e) {
    console.error('Turnstile verification failed:', e)
    return false
  }
}

async function signUploadToken(env: Env, session: UploadSession): Promise<string> {
  return await signJWT({
    purpose: 'multipart-upload',
    session_id: session.id,
    share_id: session.share_id,
    upload_id: session.upload_id,
    code_hash: session.code_hash,
    r2_key: session.r2_key,
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
  }, getRequiredSecret(env, 'SESSION_SECRET'))
}

async function verifyUploadToken(c: Context<{ Bindings: Bindings }>, tokenOverride?: string): Promise<UploadTokenPayload | null> {
  const token = tokenOverride || c.req.header('X-Upload-Token') || ''
  if (!token) return null

  const payload = await verifyJWT(token, getRequiredSecret(c.env, 'SESSION_SECRET'))
  if (
    !payload ||
    payload.purpose !== 'multipart-upload' ||
    typeof payload.session_id !== 'string' ||
    typeof payload.share_id !== 'string' ||
    typeof payload.upload_id !== 'string' ||
    typeof payload.code_hash !== 'string' ||
    typeof payload.r2_key !== 'string'
  ) {
    return null
  }
  return payload as UploadTokenPayload
}

function normalizeUploadedParts(parts: unknown): R2UploadedPart[] {
  if (!Array.isArray(parts)) return []
  return parts
    .map((part) => {
      if (!part || typeof part !== 'object') return null
      const item = part as { partNumber?: unknown; etag?: unknown }
      const partNumber = Number.parseInt(String(item.partNumber || ''), 10)
      const etag = typeof item.etag === 'string' ? item.etag : ''
      if (!Number.isInteger(partNumber) || partNumber < 1 || !etag || etag.length > 256) return null
      return { partNumber, etag }
    })
    .filter((part): part is R2UploadedPart => part !== null)
    .sort((a, b) => a.partNumber - b.partNumber)
}

function getExpireAt(config: RuntimeConfig, body: Record<string, unknown>): string {
  const expireValue = Number.parseInt(String(body.expire_value || '1'), 10)
  const expireStyle = String(body.expire_style || 'day')
  return calculateExpireAt(
    expireValue,
    expireStyle,
    config.defaultExpireHours,
    config.maxExpireHours,
  )
}

function getMaxDownloads(config: RuntimeConfig): number | null {
  return config.defaultMaxDownloads > 0
    ? Math.min(config.defaultMaxDownloads, 1_000_000)
    : null
}

function getContentLength(c: Context): number | null {
  const raw = c.req.header('Content-Length')
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function fixedLengthPartStream(body: ReadableStream<Uint8Array>, expectedBytes: number) {
  let total = 0
  let completed = false
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength
      if (total > expectedBytes) throw new BodyTooLargeError()
      controller.enqueue(chunk)
    },
    flush() {
      completed = true
    },
  })
  const fixed = new FixedLengthStream(expectedBytes)
  const pipePromise = body.pipeThrough(counter).pipeTo(fixed.writable)
  return {
    readable: fixed.readable,
    pipePromise,
    bytesRead: () => total,
    sourceCompleted: () => completed,
  }
}

function sameTurnstileHostname(tokenHostname: string, requestHostname: string): boolean {
  if (tokenHostname === requestHostname) return true
  const localHosts = new Set(['localhost', '127.0.0.1', '::1'])
  return localHosts.has(tokenHostname) && localHosts.has(requestHostname)
}

function isExpiredIso(value: string): boolean {
  return new Date(value) <= new Date()
}

export function ifNoneMatchMatches(header: string, currentEtag: string): boolean {
  const current = normalizeEntityTag(currentEtag)
  return header.split(',').some((candidate) => {
    const trimmed = candidate.trim()
    return trimmed === '*' || normalizeEntityTag(trimmed) === current
  })
}

function normalizeEntityTag(value: string): string {
  const withoutWeakPrefix = value.trim().replace(/^W\//i, '')
  return withoutWeakPrefix.startsWith('"') && withoutWeakPrefix.endsWith('"')
    ? withoutWeakPrefix.slice(1, -1)
    : withoutWeakPrefix
}

function toHttpEtag(value: string): string {
  const normalized = normalizeEntityTag(value).replace(/["\\]/g, '')
  return `"${normalized}"`
}

export function isSafeInlinePreviewMime(mimeType: string | null): boolean {
  const normalized = mimeType?.trim().toLowerCase() || ''
  if (normalized.startsWith('audio/') || normalized.startsWith('video/')) return true
  return normalized.startsWith('image/') && normalized !== 'image/svg+xml'
}

async function abortUploadSession(r2: R2Storage, db: DB, session: UploadSession): Promise<void> {
  try {
    const multipart = r2.resumeMultipartUpload(session.r2_key, session.upload_id)
    await multipart.abort()
  } catch (e) {
    console.error(`Failed to abort upload session ${session.id}:`, e)
  }
  await db.deleteUploadSession(session.id)
}

function rateLimited(c: Context, resetAt: string) {
  c.header('Retry-After', '60')
  c.header('X-RateLimit-Reset', resetAt)
  return c.json(error(ErrorCode.RATE_LIMIT_EXCEEDED, 429, 'Too many requests, please try again later'), 429)
}

function isShareAvailable(share: Share | null): share is Share {
  if (!share) return false
  if (share.deleted_at) return false
  if (new Date(share.expire_at) <= new Date()) return false
  if (share.max_downloads !== null && share.download_count >= share.max_downloads) return false
  return true
}

function isDownloadSessionShareAvailable(share: Share | null): share is Share {
  if (!share) return false
  if (share.deleted_at) return false
  return new Date(share.expire_at) > new Date()
}

function routeFailure(c: Context, operation: string, cause: unknown, message: string) {
  if (cause instanceof BodyTooLargeError) {
    return c.json(error(ErrorCode.PAYLOAD_TOO_LARGE, 413, 'Payload too large'), 413)
  }
  if (cause instanceof InvalidBodyError) {
    return c.json(error(ErrorCode.INVALID_FORMAT, 400, 'Invalid request format'), 400)
  }
  if (cause instanceof RuntimeConfigUnavailableError) {
    console.error(`${operation} failed:`, cause)
    return c.json(error(ErrorCode.SERVICE_UNAVAILABLE, 503, 'Service temporarily unavailable, please try again later'), 503)
  }
  console.error(`${operation} failed:`, cause)
  return c.json(error(ErrorCode.INTERNAL_SERVER_ERROR, 500, message), 500)
}

function shareAuditSubject(share: Share): AuditSubject {
  return {
    type: share.type,
    name: share.display_name,
    sizeBytes: share.size_bytes,
  }
}

async function audit(
  db: DB,
  c: Context,
  action: string,
  shareId: string | null,
  status: string,
  ipHash: string | null,
  options: {
    accessLog?: boolean
    config?: RuntimeConfig
    subject?: AuditSubject
  } = {},
): Promise<void> {
  try {
    const config = options.config || await getRuntimeConfig(c.env, db)
    if (!config.enableAuditLog) return
    if (options.accessLog && !config.enableAccessLog) return
    await db.createAuditLog({
      id: crypto.randomUUID(),
      action,
      share_id: shareId,
      subject_type: options.subject?.type || null,
      subject_name: options.subject?.name || null,
      size_bytes: options.subject?.sizeBytes ?? null,
      ip_hash: ipHash,
      user_agent_hash: null,
      status,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Failed to write share audit log:', error)
  }
}

export default app
