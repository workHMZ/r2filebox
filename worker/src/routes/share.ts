import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Env, Share, UploadSession } from '../types'
import { success, error } from '../lib/response'
import { generateCode, hashCode, hashIp } from '../lib/code'
import { contentDispositionAttachment, sanitizeFilename, sanitizeMimeType, calculateExpireAt } from '../lib/validators'
import { DB } from '../lib/db'
import { R2Storage, generateR2Key } from '../lib/r2'
import { getRequiredSecret } from '../lib/env'
import { getClientIp } from '../lib/security'
import { signJWT, verifyJWT } from '../lib/auth'
import { getRuntimeConfig, type RuntimeConfig } from '../lib/runtime-config'
import { checkRateLimit } from '../lib/rate-limit'
import { BodyTooLargeError, InvalidBodyError, readStructuredBody } from '../lib/body'

type Bindings = Env

const app = new Hono<{ Bindings: Bindings }>()
const MULTIPART_PART_SIZE = 8 * 1024 * 1024
const MAX_TEXT_BYTES = 1024 * 1024
const MAX_TEXT_REQUEST_BYTES = MAX_TEXT_BYTES + (64 * 1024)
const MAX_INIT_BODY_BYTES = 16 * 1024
const MAX_COMPLETE_BODY_BYTES = 64 * 1024
const MAX_RESOLVE_BODY_BYTES = 4 * 1024

interface UploadTokenPayload extends Record<string, unknown> {
  purpose: 'multipart-upload'
  session_id: string
  share_id: string
  upload_id: string
  code_hash: string
  r2_key: string
}

app.post('/share/text/', createTextShare)
app.post('/api/share/text', createTextShare)
app.post('/share/file/', unsupportedLegacyFileShare)
app.post('/api/share/file', unsupportedLegacyFileShare)
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
      return c.json(error('文本分享已关闭', 403), 403)
    }

    const maxUploadBytes = Math.min(config.maxUploadBytes, MAX_TEXT_BYTES)
    const contentLength = getContentLength(c)
    if (contentLength && contentLength > MAX_TEXT_REQUEST_BYTES) {
      return c.json(error('内容过大', 413), 413)
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
      config.enableKvRateLimit,
    )
    if (limited.limited) {
      return rateLimited(c, limited.resetAt)
    }

    const body = await readStructuredBody(c.req.raw, MAX_TEXT_REQUEST_BYTES)
    if (!await verifyTurnstileIfRequired(c, body, config, 'text-share')) {
      return c.json(error('人机验证失败', 403), 403)
    }
    const text = typeof body.text === 'string' ? body.text : ''
    if (!text.trim()) {
      return c.json(error('文本内容不能为空', 400), 400)
    }

    const textBytes = new TextEncoder().encode(text)
    if (textBytes.length > maxUploadBytes) {
      return c.json(error('内容过大', 413), 413)
    }

    const codeLength = config.codeLength
    const rawCode = generateCode(codeLength)
    const codeHash = await hashCode(rawCode, pepper)
    const shareId = crypto.randomUUID()
    const r2Key = generateR2Key(shareId)
    const expireAt = getExpireAt(config, body)
    const maxDownloads = getMaxDownloads(config, body)

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
        title: typeof body.title === 'string' ? body.title.slice(0, 200) : '未命名文本',
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
        return c.json(error('存储空间已达软限制', 403), 403)
      }
    } catch (error) {
      await Promise.allSettled([r2.deleteObject(r2Key)])
      throw error
    }

    const url = `${new URL(c.req.url).origin}/#/share/${rawCode}`
    await audit(db, c, 'share_text_create', shareId, 'success', ipHash)

    return c.json(success({
      code: rawCode,
      share_url: `/share/${rawCode}`,
      full_share_url: url,
      qr_code_data: url,
      expireAt,
      maxDownloads,
    }, '分享成功'))
  } catch (e: unknown) {
    return routeFailure(c, 'create text share', e, '分享失败')
  }
}

async function unsupportedLegacyFileShare(c: Context<{ Bindings: Bindings }>) {
  return c.json(error('请使用分片上传接口 /api/share/file/init', 410), 410)
}

async function initMultipartFileShare(c: Context<{ Bindings: Bindings }>) {
  try {
    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)
    if (!config.enablePublicUpload || !config.enableFileShare) {
      return c.json(error('文件分享已关闭', 403), 403)
    }

    const maxUploadBytes = config.maxUploadBytes
    const body = await readStructuredBody(c.req.raw, MAX_INIT_BODY_BYTES)
    if (!await verifyTurnstileIfRequired(c, body, config, 'file-share')) {
      return c.json(error('人机验证失败', 403), 403)
    }
    const sizeBytes = Number.parseInt(String(body.size || body.size_bytes || '0'), 10)
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return c.json(error('文件大小无效', 400), 400)
    }
    if (sizeBytes > maxUploadBytes) {
      return c.json(error(`文件过大，最大允许 ${Math.floor(maxUploadBytes / 1024 / 1024)}MB`, 413), 413)
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
      config.enableKvRateLimit,
    )
    if (limited.limited) {
      return rateLimited(c, limited.resetAt)
    }

    const maxStorage = config.maxTotalStorageBytes

    const safeFilename = sanitizeFilename(String(body.filename || body.name || 'upload.bin'))
    const mimeType = sanitizeMimeType(String(body.mimeType || body.mime_type || 'application/octet-stream'))
    const codeLength = config.codeLength
    const rawCode = generateCode(codeLength)
    const codeHash = await hashCode(rawCode, pepper)
    const shareId = crypto.randomUUID()
    const r2Key = generateR2Key(shareId)
    const expireAt = getExpireAt(config, body)
    const maxDownloads = getMaxDownloads(config, body)

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
      return c.json(error('存储空间已达软限制', 403), 403)
    }

    const uploadToken = await signUploadToken(c.env, session)
    const partCount = Math.ceil(sizeBytes / MULTIPART_PART_SIZE)
    await audit(db, c, 'multipart_file_init', shareId, 'success', ipHash)

    return c.json(success({
      uploadId: multipart.uploadId,
      uploadToken,
      code: rawCode,
      shareId,
      partSize: MULTIPART_PART_SIZE,
      partCount,
      expireAt,
      maxDownloads,
      file_name: safeFilename,
      filename: safeFilename,
      size: sizeBytes,
    }, '上传会话已创建'))
  } catch (e: unknown) {
    return routeFailure(c, 'initialize multipart upload', e, '初始化上传失败')
  }
}

async function uploadMultipartPart(c: Context<{ Bindings: Bindings }>) {
  try {
    const payload = await verifyUploadToken(c)
    if (!payload) {
      return c.json(error('上传会话无效', 401), 401)
    }

    const partNumber = Number.parseInt(c.req.header('X-Part-Number') || c.req.query('partNumber') || '', 10)
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      return c.json(error('分片编号无效', 400), 400)
    }
    if (!c.req.raw.body) {
      return c.json(error('缺少分片内容', 400), 400)
    }

    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)
    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    const ipHash = await hashIp(getClientIp(c), pepper)
    const limited = await checkRateLimit(
      c.env,
      db,
      'upload_part',
      ipHash || payload.session_id,
      60,
      config.rateLimitUploadPartPerMinute,
      config.enableKvRateLimit,
    )
    if (limited.limited) {
      return rateLimited(c, limited.resetAt)
    }

    const session = await db.getUploadSession(payload.session_id)
    if (
      !session ||
      session.share_id !== payload.share_id ||
      session.upload_id !== payload.upload_id ||
      session.r2_key !== payload.r2_key
    ) {
      return c.json(error('上传会话不存在', 404), 404)
    }

    const r2 = new R2Storage(c.env.BUCKET)
    if (isExpiredIso(session.expire_at)) {
      await abortUploadSession(r2, db, session)
      return c.json(error('上传会话已过期，请重新上传', 410), 410)
    }

    const partCount = Math.ceil(session.size_bytes / MULTIPART_PART_SIZE)
    if (partNumber > partCount) {
      return c.json(error('分片编号无效', 400), 400)
    }
    const expectedBytes = partNumber === partCount
      ? session.size_bytes - ((partCount - 1) * MULTIPART_PART_SIZE)
      : MULTIPART_PART_SIZE
    const contentLength = getContentLength(c)
    if (contentLength !== null && contentLength !== expectedBytes) {
      return c.json(error(contentLength > expectedBytes ? '分片过大' : '分片大小不完整', contentLength > expectedBytes ? 413 : 400), contentLength > expectedBytes ? 413 : 400)
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
      return c.json(error('分片大小不完整，请重新上传', 400), 400)
    }
    if (uploadResult.status === 'rejected') throw uploadResult.reason
    if (pipeResult.status === 'rejected') throw pipeResult.reason
    return c.json(success(uploadResult.value))
  } catch (e: unknown) {
    return routeFailure(c, 'upload multipart part', e, '上传分片失败')
  }
}

async function completeMultipartFileShare(c: Context<{ Bindings: Bindings }>) {
  try {
    const payload = await verifyUploadToken(c)
    if (!payload) {
      return c.json(error('上传会话无效', 401), 401)
    }
    const body = await readStructuredBody(c.req.raw, MAX_COMPLETE_BODY_BYTES)
    const code = String(body.code || '')
    const parts = normalizeUploadedParts(body.parts)
    if (!parts.length) {
      return c.json(error('缺少分片完成信息', 400), 400)
    }

    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    if (await hashCode(code, pepper) !== payload.code_hash) {
      return c.json(error('上传会话无效', 401), 401)
    }

    const db = new DB(c.env.DB)
    const session = await db.getUploadSession(payload.session_id)
    if (
      !session ||
      session.share_id !== payload.share_id ||
      session.upload_id !== payload.upload_id ||
      session.r2_key !== payload.r2_key ||
      session.code_hash !== payload.code_hash
    ) {
      return c.json(error('上传会话不存在', 404), 404)
    }

    const r2 = new R2Storage(c.env.BUCKET)
    if (isExpiredIso(session.expire_at)) {
      await abortUploadSession(r2, db, session)
      return c.json(error('上传会话已过期，请重新上传', 410), 410)
    }

    const expectedPartCount = Math.ceil(session.size_bytes / MULTIPART_PART_SIZE)
    if (
      parts.length !== expectedPartCount ||
      parts.some((part, index) => part.partNumber !== index + 1)
    ) {
      return c.json(error('分片完成信息不完整', 400), 400)
    }

    const multipart = r2.resumeMultipartUpload(session.r2_key, session.upload_id)
    const uploaded = await multipart.complete(parts)
    if (uploaded.size !== session.size_bytes) {
      await r2.deleteObject(session.r2_key)
      await db.deleteUploadSession(session.id)
      await audit(db, c, 'multipart_file_size_mismatch', session.share_id, 'failed', session.created_ip_hash)
      return c.json(error('文件大小校验失败，请重新上传', 400), 400)
    }

    const now = new Date().toISOString()
    try {
      await db.createShare({
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
      })
    } catch (error) {
      await Promise.allSettled([
        r2.deleteObject(session.r2_key),
        db.deleteUploadSession(session.id),
      ])
      throw error
    }
    try {
      await db.deleteUploadSession(session.id)
    } catch (error) {
      console.error(`Failed to delete completed upload session ${session.id}:`, error)
    }

    const url = `${new URL(c.req.url).origin}/#/share/${code}`
    await audit(db, c, 'multipart_file_complete', session.share_id, 'success', session.created_ip_hash)
    return c.json(success({
      code,
      share_url: `/share/${code}`,
      full_share_url: url,
      qr_code_data: url,
      file_name: session.display_name,
      filename: session.display_name,
      size: session.size_bytes,
      expireAt: session.expire_at,
      maxDownloads: session.max_downloads,
    }, '文件上传成功'))
  } catch (e: unknown) {
    return routeFailure(c, 'complete multipart upload', e, '完成上传失败')
  }
}

async function abortMultipartFileShare(c: Context<{ Bindings: Bindings }>) {
  try {
    const payload = await verifyUploadToken(c)
    if (!payload) {
      return c.json(error('上传会话无效', 401), 401)
    }
    const db = new DB(c.env.DB)
    const session = await db.getUploadSession(payload.session_id)
    if (!session) {
      return c.json(success(null, '上传会话已结束'))
    }
    const r2 = new R2Storage(c.env.BUCKET)
    await abortUploadSession(r2, db, session)
    return c.json(success(null, '上传已取消'))
  } catch (e: unknown) {
    return routeFailure(c, 'abort multipart upload', e, '取消上传失败')
  }
}



async function resolveShareFromBody(c: Context<{ Bindings: Bindings }>) {
  try {
    const body = await readStructuredBody(c.req.raw, MAX_RESOLVE_BODY_BYTES)
    return resolveShare(c, typeof body.code === 'string' ? body.code : undefined)
  } catch (e) {
    return routeFailure(c, 'parse share resolve request', e, '请求格式无效')
  }
}

async function resolveShare(c: Context<{ Bindings: Bindings }>, rawCode: string | undefined) {
  try {
    if (!rawCode || rawCode.length > 128 || !/^[23456789A-HJ-NP-Za-km-z]+$/.test(rawCode)) {
      return c.json(error('提取码无效或文件已不可用', 404), 404)
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
      config.enableKvRateLimit,
    )
    if (limited.limited) {
      return rateLimited(c, limited.resetAt)
    }

    const codeHash = await hashCode(rawCode, pepper)
    const share = await db.getShareByCodeHash(codeHash)

    if (!isShareAvailable(share)) {
      return c.json(error('提取码无效或文件已不可用', 404, { has_password: false }), 404)
    }

    if (share.type === 'text') {
      const r2 = new R2Storage(c.env.BUCKET)
      const obj = await r2.getObject(share.r2_key)
      if (!obj) {
        return c.json(error('提取码无效或文件已不可用', 404), 404)
      }
      const text = await obj.text()
      if (!await db.consumeShareDownload(share.id)) {
        return c.json(error('提取码无效或文件已不可用', 404), 404)
      }
      await audit(db, c, 'share_resolve_text', share.id, 'success', ipHash, true)
      return c.json(success({
        code: rawCode,
        type: 'text',
        text,
        file_name: share.display_name || undefined,
        file_size: share.size_bytes,
        has_password: false,
        expire_time: share.expire_at,
        views: share.download_count + 1,
        max_views: share.max_downloads,
        downloadCount: share.download_count + 1,
        maxDownloads: share.max_downloads,
      }))
    }

    const token = await signJWT({
      purpose: 'download',
      share_id: share.id,
      exp: Math.floor(Date.now() / 1000) + 120,
      nonce: crypto.randomUUID(),
    }, getRequiredSecret(c.env, 'SESSION_SECRET'))
    const downloadUrl = `/api/share/download/${share.id}`
    c.header(
      'Set-Cookie',
      `download_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=${downloadUrl}; Max-Age=120`,
    )

    await audit(db, c, 'share_resolve_file', share.id, 'success', ipHash, true)
    return c.json(success({
      code: rawCode,
      type: 'file',
      file_name: share.display_name || undefined,
      filename: share.display_name || undefined,
      file_size: share.size_bytes,
      size: share.size_bytes,
      mimeType: share.mime_type,
      has_password: false,
      expire_time: share.expire_at,
      views: share.download_count,
      max_views: share.max_downloads,
      downloadCount: share.download_count,
      maxDownloads: share.max_downloads,
      download_url: downloadUrl,
    }))
  } catch (e: unknown) {
    return routeFailure(c, 'resolve share', e, '获取分享失败')
  }
}

async function downloadWithSession(c: Context<{ Bindings: Bindings }>) {
  try {
    const shareId = c.req.param('shareId')
    const token = getCookieValue(c.req.header('Cookie') || '', 'download_session')
    if (!shareId || !token || !/^[0-9a-f-]{36}$/i.test(shareId)) {
      return new Response('提取码无效或文件已不可用', { status: 404 })
    }
    const payload = await verifyJWT(token, getRequiredSecret(c.env, 'SESSION_SECRET'))
    if (
      !payload ||
      payload.purpose !== 'download' ||
      typeof payload.share_id !== 'string' ||
      payload.share_id !== shareId
    ) {
      return new Response('提取码无效或文件已不可用', { status: 404 })
    }

    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)
    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    const ipHash = await hashIp(getClientIp(c), pepper)
    const limited = await checkRateLimit(
      c.env,
      db,
      'download',
      ipHash,
      60,
      config.rateLimitDownloadPerMinute,
      config.enableKvRateLimit,
    )
    if (limited.limited) {
      return new Response('请求过于频繁，请稍后再试', {
        status: 429,
        headers: { 'Retry-After': '60' },
      })
    }

    const share = await db.getShareById(shareId)
    if (!isShareAvailable(share) || share.type !== 'file') {
      return new Response('提取码无效或文件已不可用', { status: 404 })
    }

    const r2 = new R2Storage(c.env.BUCKET)
    const obj = await r2.getObject(share.r2_key)
    if (!obj) {
      return new Response('提取码无效或文件已不可用', { status: 404 })
    }

    if (!await db.consumeShareDownload(share.id)) {
      return new Response('提取码无效或文件已不可用', { status: 404 })
    }
    c.executionCtx.waitUntil(audit(db, c, 'share_download_file', share.id, 'success', ipHash, true))

    const headers = new Headers()
    obj.writeHttpMetadata(headers)
    headers.set('Content-Type', share.mime_type || 'application/octet-stream')
    headers.set('Content-Disposition', contentDispositionAttachment(share.display_name || 'download'))
    headers.set('Cache-Control', 'private, no-store')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'no-referrer')
    headers.set('etag', obj.httpEtag)
    headers.append(
      'Set-Cookie',
      `download_session=; HttpOnly; Secure; SameSite=Strict; Path=/api/share/download/${share.id}; Max-Age=0`,
    )

    return new Response(obj.body, { headers })
  } catch (e: unknown) {
    console.error('download share failed:', e)
    return new Response('下载失败', { status: 500 })
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

async function verifyTurnstileIfRequired(
  c: Context<{ Bindings: Bindings }>,
  body: Record<string, unknown>,
  config: RuntimeConfig,
  expectedAction: string,
): Promise<boolean> {
  if (!config.requireTurnstile) return true

  const token = body.turnstileToken || body.turnstile_token || body['cf-turnstile-response']
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

async function verifyUploadToken(c: Context<{ Bindings: Bindings }>): Promise<UploadTokenPayload | null> {
  const token = c.req.header('X-Upload-Token') || ''
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
  const expireHours = body.expireHours || body.expire_hours
    ? Number.parseInt(String(body.expireHours || body.expire_hours), 10)
    : undefined
  return calculateExpireAt(
    expireValue,
    expireStyle,
    expireHours,
    config.defaultExpireHours,
    config.maxExpireHours,
  )
}

function getMaxDownloads(config: RuntimeConfig, body: Record<string, unknown>): number | null {
  const raw = body.maxDownloads || body.max_downloads || body.maxViews || body.max_views
  const fallback = config.defaultMaxDownloads
  const parsed = raw ? Number.parseInt(String(raw), 10) : fallback
  return parsed > 0 ? Math.min(parsed, 1_000_000) : null
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
  return c.json(error('请求过于频繁，请稍后再试', 429), 429)
}

function isShareAvailable(share: Share | null): share is Share {
  if (!share) return false
  if (share.deleted_at) return false
  if (new Date(share.expire_at) <= new Date()) return false
  if (share.max_downloads !== null && share.download_count >= share.max_downloads) return false
  return true
}

function routeFailure(c: Context, operation: string, cause: unknown, message: string) {
  if (cause instanceof BodyTooLargeError) {
    return c.json(error('请求内容过大', 413), 413)
  }
  if (cause instanceof InvalidBodyError) {
    return c.json(error('请求格式无效', 400), 400)
  }
  console.error(`${operation} failed:`, cause)
  return c.json(error(message, 500), 500)
}

async function audit(
  db: DB,
  c: Context,
  action: string,
  shareId: string | null,
  status: string,
  ipHash: string | null,
  accessLog = false,
): Promise<void> {
  try {
    const config = await getRuntimeConfig(c.env, db)
    if (!config.enableAuditLog) return
    if (accessLog && !config.enableAccessLog) return
    await db.createAuditLog({
      id: crypto.randomUUID(),
      action,
      share_id: shareId,
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
