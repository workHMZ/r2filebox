import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import type { Env, Share } from '../types'
import { success, error } from '../lib/response'
import { ErrorCode } from '../types/errors'
import { signJWT, verifyJWT } from '../lib/auth'
import { verifyPassword, verifyPlainPassword } from '../lib/password'
import { DB } from '../lib/db'
import { R2Storage } from '../lib/r2'
import { clamp, getRequiredSecret } from '../lib/env'
import { getClientIp } from '../lib/security'
import { hashIp } from '../lib/code'
import { cleanupExpiredShares } from '../lib/cleanup'
import {
  getRuntimeConfig,
  type RuntimeConfig,
} from '../lib/runtime-config'
import { checkRateLimit } from '../lib/rate-limit'
import { readStructuredBody } from '../lib/body'
import {
  readSessionCookie,
  routeFailure,
  setSessionCookie,
  shareAuditSubject,
  writeAuditLog,
} from '../lib/route-helpers'

type Bindings = Env
type JsonRecord = Record<string, unknown>
type AdminSession = JsonRecord & {
  sub: 'admin'
  username: string
  role: 'admin'
}
const app = new Hono<{ Bindings: Bindings, Variables: { user: AdminSession } }>()
const MAX_LOGIN_BODY_BYTES = 8 * 1024
const MAX_ADMIN_CONFIG_BODY_BYTES = 64 * 1024

app.use('/admin/*', adminAuth)

app.post('/admin/login', async (c) => {
  try {
    const origin = c.req.header('Origin')
    if (origin && !isSameOrigin(c)) {
      return c.json(error(ErrorCode.FORBIDDEN, 403, 'Invalid request origin'), 403)
    }
    const body = await readStructuredBody(c.req.raw, MAX_LOGIN_BODY_BYTES)
    const password = String(body.password || '')
    const username = String(body.username || 'admin')
    if (password.length > 4096 || username.length > 256) {
      return c.json(error(ErrorCode.INVALID_CREDENTIALS, 400, 'Invalid username or password'), 400)
    }
    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)

    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    const ipHash = await hashIp(getClientIp(c), pepper)
    const limited = await checkRateLimit(
      c.env,
      db,
      'admin_login',
      ipHash,
      15 * 60,
      config.rateLimitAuthPer15Min,
      false,
    )
    if (limited.limited) {
      return c.json(error(ErrorCode.INVALID_CREDENTIALS, 400, 'Invalid username or password'), 400)
    }

    const adminUser = c.env.ADMIN_USERNAME || 'admin'
    const adminHash = c.env.ADMIN_PASSWORD_HASH
    const adminPassword = c.env.ADMIN_PASSWORD
    if (!adminUser || adminUser.length > 256 || /[\x00-\x1f\x7f]/.test(adminUser)) {
      throw new Error('ADMIN_USERNAME is invalid')
    }
    if (!adminHash && !adminPassword) {
      throw new Error('Missing ADMIN_PASSWORD or ADMIN_PASSWORD_HASH secret')
    }
    if (!adminHash && (adminPassword || '').length < 16) {
      throw new Error('ADMIN_PASSWORD must contain at least 16 characters')
    }
    const sessionSecret = getRequiredSecret(c.env, 'SESSION_SECRET')

    const validUser = username === adminUser
    const validPassword = adminHash
      ? await verifyPassword(password, adminHash)
      : await verifyPlainPassword(password, adminPassword || '')
    if (!validUser || !validPassword) {
      return c.json(error(ErrorCode.INVALID_CREDENTIALS, 400, 'Invalid username or password'), 400)
    }

    const token = await signJWT({
      sub: 'admin',
      username: adminUser,
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
    }, sessionSecret)

    await writeAuditLog(db, c, 'admin_login', null, 'success', ipHash, {
      config,
      subject: { type: 'admin', name: adminUser, sizeBytes: null },
    })
    setSessionCookie(c, 'admin_session', token, '/admin', 12 * 60 * 60)

    return c.json(success({
      user: adminUserDto(adminUser),
    }, 'Login successful'))
  } catch (e: unknown) {
    return routeFailure(c, 'admin login', e, 'Login failed')
  }
})

app.get('/admin/session', (c) => {
  return c.json(success({
    user: adminUserDto(c.get('user').username),
  }))
})

app.post('/admin/logout', async (c) => {
  try {
    const db = new DB(c.env.DB)
    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    await writeAuditLog(db, c, 'admin_logout', null, 'success', await hashIp(getClientIp(c), pepper), {
      subject: { type: 'admin', name: c.get('user').username, sizeBytes: null },
    })
  } catch (cause) {
    console.error('Failed to write admin logout audit log:', cause)
  }
  setSessionCookie(c, 'admin_session', '', '/admin', 0)
  return c.json(success(null, 'Logout successful'))
})

app.get('/admin/stats', async (c) => {
  try {
    const db = new DB(c.env.DB)
    const stats = await db.getSystemStats(parseUtcOffsetMinutes(c.req.query('utc_offset_minutes')))
    return c.json(success(stats))
  } catch (e: unknown) {
    return routeFailure(c, 'get admin stats', e, 'Could not load statistics')
  }
})

app.get('/admin/files', async (c) => {
  try {
    const pageSize = parseBoundedInteger(c.req.query('page_size'), 10, 1, 100)
    const page = parseBoundedInteger(c.req.query('page'), 1, 1, Math.floor(Number.MAX_SAFE_INTEGER / pageSize))
    const offset = (page - 1) * pageSize
    const db = new DB(c.env.DB)
    const result = await db.getSharesList(pageSize, offset)

    return c.json(success({
      items: result.items.map(adminShareDto),
      total: result.total,
      page,
      page_size: pageSize,
    }))
  } catch (e: unknown) {
    return routeFailure(c, 'get admin files', e, 'Could not load files')
  }
})

app.delete('/admin/files/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const db = new DB(c.env.DB)
    const share = await db.getShareById(id)
    if (!share) {
      return c.json(error(ErrorCode.FILE_NOT_FOUND, 404, 'File not found'), 404)
    }

    const r2 = new R2Storage(c.env.BUCKET)
    if (share.type === 'file' && share.blob_id) {
      // Managed file shares may reference the same physical object. Delete the
      // logical share first; the D1 trigger only orphans the final reference.
      // R2/D1 cleanup is best-effort here because the orphan row is a durable
      // outbox entry that the scheduled cleanup retries.
      await db.deleteShareById(id)
      try {
        const orphanedAt = new Date().toISOString()
        const [orphanedBlob] = await db.orphanUnreferencedFileBlobs([share.blob_id], orphanedAt)
        const blob = orphanedBlob ?? await db.getFileBlobById(share.blob_id)
        if (blob?.status === 'orphaned') {
          await r2.deleteObject(blob.r2_key)
          const removed = await db.deleteOrphanedFileBlob(blob.id)
          if (!removed && await db.getFileBlobById(blob.id)) {
            throw new Error('Orphaned blob row was retained after R2 deletion')
          }
        }
      } catch (cleanupError) {
        console.error(`Deferred cleanup for orphaned file blob ${share.blob_id}:`, cleanupError)
      }
    } else {
      // Text shares and pre-migration file rows still own their R2 key directly.
      // Keep the delete-first behavior so an R2 failure leaves the share active
      // and retryable instead of producing an untracked direct object.
      await r2.deleteObject(share.r2_key)
      await db.deleteShareById(id)
    }

    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    await writeAuditLog(db, c, 'admin_delete_share', id, 'success', await hashIp(getClientIp(c), pepper), {
      subject: shareAuditSubject(share),
    })
    return c.json(success(null, 'Deleted successfully'))
  } catch (e: unknown) {
    return routeFailure(c, 'delete admin share', e, 'Delete failed')
  }
})

app.get('/admin/config', async (c) => {
  try {
    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)
    return c.json(success(adminConfigDto(config)))
  } catch (e: unknown) {
    return routeFailure(c, 'get admin config', e, 'Could not load configuration')
  }
})

app.put('/admin/config', async (c) => {
  try {
    const body = await readStructuredBody(c.req.raw, MAX_ADMIN_CONFIG_BODY_BYTES)
    const configBody = body.config || body
    if (typeof configBody !== 'object' || configBody === null || Array.isArray(configBody)) {
      return c.json(error(ErrorCode.INVALID_CONFIG, 400, 'Invalid configuration format'), 400)
    }
    const configRecord = configBody as JsonRecord
    const db = new DB(c.env.DB)
    const previousConfig = await getRuntimeConfig(c.env, db)
    const settings = settingsFromAdminConfig(configRecord, previousConfig)
    const turnstileConfigTouched =
      settings.REQUIRE_TURNSTILE !== undefined ||
      settings.TURNSTILE_SITE_KEY !== undefined
    const nextRequireTurnstile = settings.REQUIRE_TURNSTILE !== undefined
      ? settings.REQUIRE_TURNSTILE === 'true'
      : previousConfig.requireTurnstile
    const nextTurnstileSiteKey = settings.TURNSTILE_SITE_KEY !== undefined
      ? settings.TURNSTILE_SITE_KEY
      : (previousConfig.turnstileSiteKey || '')
    if (
      turnstileConfigTouched &&
      nextRequireTurnstile &&
      (
        !nextTurnstileSiteKey ||
        typeof c.env.TURNSTILE_SECRET_KEY !== 'string' ||
        c.env.TURNSTILE_SECRET_KEY.length < 16
      )
    ) {
      return c.json(error(ErrorCode.TURNSTILE_CONFIG_MISSING, 400, 'Turnstile Site Key and TURNSTILE_SECRET_KEY are required'), 400)
    }
    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    const ipHash = await hashIp(getClientIp(c), pepper)
    await db.upsertSettings(settings)
    const config = await getRuntimeConfig(c.env, db)
    await writeAuditLog(
      db,
      c,
      'admin_update_config',
      null,
      'success',
      ipHash,
      {
        force: previousConfig.enableAuditLog || config.enableAuditLog,
        config,
        subject: { type: 'system', name: 'global-config', sizeBytes: null },
      },
    )
    return c.json(success(adminConfigDto(config), 'Configuration saved'))
  } catch (e: unknown) {
    return routeFailure(c, 'save admin config', e, 'Could not save configuration')
  }
})

app.get('/admin/stats/trend', async (c) => {
  try {
    const days = parseBoundedInteger(c.req.query('days'), 7, 1, 30)
    const db = new DB(c.env.DB)
    const trend = await db.getUploadTrend(days, parseUtcOffsetMinutes(c.req.query('utc_offset_minutes')))
    return c.json(success(trend))
  } catch (e: unknown) {
    return routeFailure(c, 'get upload trend', e, 'Could not load upload trend')
  }
})

app.get('/admin/stats/file-types', async (c) => {
  try {
    const db = new DB(c.env.DB)
    const distribution = await db.getFileTypeDistribution()
    return c.json(success(distribution))
  } catch (e: unknown) {
    return routeFailure(c, 'get file type distribution', e, 'Could not load file type distribution')
  }
})

app.get('/admin/logs/audit', async (c) => {
  try {
    const pageSize = parseBoundedInteger(c.req.query('page_size'), 20, 1, 100)
    const page = parseBoundedInteger(c.req.query('page'), 1, 1, Math.floor(Number.MAX_SAFE_INTEGER / pageSize))
    const offset = (page - 1) * pageSize
    const db = new DB(c.env.DB)
    const includeStats = c.req.query('include_stats') !== 'false'
    const logs = await db.getAuditLogs(pageSize, offset, includeStats)
    const items = logs.items.map((log) => ({
      id: log.id,
      action: log.action,
      share_id: log.share_id,
      subject_type: log.subject_type,
      subject_name: log.subject_name,
      size_bytes: log.size_bytes,
      ip_hash_prefix: log.ip_hash?.slice(0, 12) || null,
      status: log.status,
      created_at: log.created_at,
    }))
    return c.json(success({
      items,
      pagination: { page, page_size: pageSize, total: logs.total },
      stats: logs.stats,
    }))
  } catch (e: unknown) {
    return routeFailure(c, 'get audit logs', e, 'Could not load audit logs')
  }
})

app.get('/admin/maintenance/system-info', (c) => {
  return c.json(success({
    runtime: 'Cloudflare Workers',
    platform: 'V8 isolate',
    storage: 'D1 + R2 + Workers Rate Limiting',
    version: c.env.APP_VERSION || '2.9.2',
    r2_bucket_name: c.env.R2_BUCKET_NAME || null,
    d1_database_name: c.env.D1_DATABASE_NAME || null,
  }))
})

app.post('/admin/maintenance/clean-expired', async (c) => {
  try {
    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)
    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    const ipHash = await hashIp(getClientIp(c), pepper)
    // An administrator is waiting on this response, and an HTTP request gets the
    // same 10 ms of CPU on the Free plan as a Cron run, so drain one batch less.
    // The operation is idempotent, so clearing a large backlog is just repeated
    // clicks - or the hourly Cron catching up on its own.
    const result = await cleanupExpiredShares(
      c.env.DB,
      c.env.BUCKET,
      config.cleanupBatchSize,
      { maxPasses: 2, budgetMs: 5_000 },
    )
    await writeAuditLog(db, c, 'admin_cleanup_expired', null, result.failures ? 'partial' : 'success', ipHash, {
      config,
      subject: { type: 'system', name: 'expired-content', sizeBytes: null },
    })
    return c.json(success({
      deleted_count: result.processed,
      deleted_r2_objects: result.deletedR2,
      aborted_uploads: result.abortedUploads,
      purged_counters: result.purgedCounters,
      purged_audit_logs: result.purgedAuditLogs,
      purged_shares: result.purgedShares,
      failures: result.failures,
    }, 'Cleanup completed'))
  } catch (e: unknown) {
    return routeFailure(c, 'cleanup expired shares', e, 'Cleanup failed')
  }
})

async function adminAuth(c: Context<{ Bindings: Bindings, Variables: { user: AdminSession } }>, next: Next) {
  if (c.req.path === '/admin/login') {
    return next()
  }

  const cookieToken = readSessionCookie(c, 'admin_session')
  if (cookieToken && !isSafeMethod(c.req.method) && !isSameOrigin(c)) {
    return c.json(error(ErrorCode.FORBIDDEN, 403, 'Invalid request origin'), 403)
  }
  if (!cookieToken) {
    return c.json(error(ErrorCode.UNAUTHORIZED, 401, 'Unauthorized or session expired'), 401)
  }

  const payload = await verifyJWT(cookieToken, getRequiredSecret(c.env, 'SESSION_SECRET'))
  if (
    !payload ||
    payload.sub !== 'admin' ||
    payload.role !== 'admin' ||
    typeof payload.username !== 'string'
  ) {
    return c.json(error(ErrorCode.UNAUTHORIZED, 401, 'Unauthorized or invalid credentials'), 401)
  }

  c.set('user', payload as AdminSession)
  await next()
}

function adminUserDto(username: string) {
  return {
    id: 'admin',
    username,
    nickname: 'Admin',
    role: 'admin' as const,
  }
}

function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

function isSameOrigin(c: Context): boolean {
  const origin = c.req.header('Origin')
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(c.req.url).origin
  } catch {
    return false
  }
}

function adminShareDto(share: Share) {
  return {
    id: share.id,
    type: share.type,
    display_name: share.display_name,
    mime_type: share.mime_type,
    size_bytes: share.size_bytes,
    download_count: share.download_count,
    max_downloads: share.max_downloads,
    created_at: share.created_at,
    expire_at: share.expire_at,
  }
}

function adminConfigDto(config: RuntimeConfig) {
  return {
    base: {
      name: config.appName,
      description: config.appDescription,
    },
    storage: {
      type: 'r2',
      max_size: Math.floor(config.maxUploadBytes / 1024 / 1024),
      max_total_storage_bytes: config.maxTotalStorageBytes,
    },
    transfer: {
      max_count: config.defaultMaxDownloads,
      expire_default: config.defaultExpireHours,
      max_expire_hours: config.maxExpireHours,
      enable_text_share: config.enableTextShare ? 1 : 0,
      enable_file_share: config.enableFileShare ? 1 : 0,
      upload: {
        openupload: config.enablePublicUpload ? 1 : 0,
        uploadsize: config.maxUploadBytes,
      },
      rate_limit: {
        enabled: config.enableNativeRateLimit ? 1 : 0,
        upload_per_minute: config.rateLimitUploadPerMinute,
        upload_part_per_minute: config.rateLimitUploadPartPerMinute,
        resolve_per_minute: config.rateLimitResolvePerMinute,
        download_per_minute: config.rateLimitDownloadPerMinute,
        auth_per_15_min: config.rateLimitAuthPer15Min,
      },
    },
    security: {
      enable_audit_log: config.enableAuditLog ? 1 : 0,
      enable_access_log: config.enableAccessLog ? 1 : 0,
      require_turnstile: config.requireTurnstile ? 1 : 0,
      turnstile_site_key: config.turnstileSiteKey || '',
    },
  }
}

function settingsFromAdminConfig(config: JsonRecord, previousConfig: RuntimeConfig): Record<string, string> {
  const settings: Record<string, string> = {}
  const base = asRecord(config.base)
  if (base) {
    setString(settings, 'APP_NAME', base.name)
    setString(settings, 'APP_DESCRIPTION', base.description)
  }
  const storage = asRecord(config.storage)
  if (storage) {
    setNumber(settings, 'MAX_TOTAL_STORAGE_BYTES', storage.max_total_storage_bytes)
  }
  const transfer = asRecord(config.transfer)
  if (transfer) {
    setNumber(settings, 'DEFAULT_MAX_DOWNLOADS', transfer.max_count)
    setNumber(settings, 'DEFAULT_EXPIRE_HOURS', transfer.expire_default)
    setNumber(settings, 'MAX_EXPIRE_HOURS', transfer.max_expire_hours)
    if (settings.DEFAULT_EXPIRE_HOURS !== undefined || settings.MAX_EXPIRE_HOURS !== undefined) {
      const maxExpire = clamp(
        Number(settings.MAX_EXPIRE_HOURS ?? previousConfig.maxExpireHours),
        1,
        8760,
      )
      const defaultExpire = clamp(
        Number(settings.DEFAULT_EXPIRE_HOURS ?? previousConfig.defaultExpireHours),
        1,
        maxExpire,
      )
      if (settings.MAX_EXPIRE_HOURS !== undefined) {
        settings.MAX_EXPIRE_HOURS = String(maxExpire)
      }
      if (settings.DEFAULT_EXPIRE_HOURS !== undefined || defaultExpire !== previousConfig.defaultExpireHours) {
        settings.DEFAULT_EXPIRE_HOURS = String(defaultExpire)
      }
    }
    setBoolean(settings, 'ENABLE_TEXT_SHARE', transfer.enable_text_share)
    setBoolean(settings, 'ENABLE_FILE_SHARE', transfer.enable_file_share)
    const upload = asRecord(transfer.upload)
    if (upload) {
      setBoolean(settings, 'ENABLE_PUBLIC_UPLOAD', upload.openupload)
      setNumber(settings, 'MAX_UPLOAD_BYTES', upload.uploadsize)
    }
    const rateLimit = asRecord(transfer.rate_limit)
    if (rateLimit) {
      setBoolean(settings, 'ENABLE_NATIVE_RATE_LIMIT', rateLimit.enabled)
      setNumber(settings, 'RATE_LIMIT_UPLOAD_PER_MINUTE', rateLimit.upload_per_minute)
      setNumber(settings, 'RATE_LIMIT_UPLOAD_PART_PER_MINUTE', rateLimit.upload_part_per_minute)
      setNumber(settings, 'RATE_LIMIT_RESOLVE_PER_MINUTE', rateLimit.resolve_per_minute)
      setNumber(settings, 'RATE_LIMIT_DOWNLOAD_PER_MINUTE', rateLimit.download_per_minute)
      setNumber(settings, 'RATE_LIMIT_AUTH_PER_15_MIN', rateLimit.auth_per_15_min)
    }
  }
  const security = asRecord(config.security)
  if (security) {
    setBoolean(settings, 'ENABLE_AUDIT_LOG', security.enable_audit_log)
    setBoolean(settings, 'ENABLE_ACCESS_LOG', security.enable_access_log)
    setBoolean(settings, 'REQUIRE_TURNSTILE', security.require_turnstile)
    if (typeof security.turnstile_site_key === 'string') {
      settings.TURNSTILE_SITE_KEY = security.turnstile_site_key.trim()
    }
  }
  return settings
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function setString(settings: Record<string, string>, key: string, value: unknown) {
  if (typeof value === 'string') settings[key] = value
}

function setNumber(settings: Record<string, string>, key: string, value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (Number.isFinite(parsed) && parsed >= 1) settings[key] = String(parsed)
}

function setBoolean(settings: Record<string, string>, key: string, value: unknown) {
  if (value === undefined || value === null) return
  settings[key] = value === true || value === 1 || value === '1' || value === 'true' ? 'true' : 'false'
}

// Real offsets run from UTC-12:00 to UTC+14:00.
function parseUtcOffsetMinutes(value: string | undefined): number {
  return parseBoundedInteger(value, 0, -12 * 60, 14 * 60)
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback
}

export default app
