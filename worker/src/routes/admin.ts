import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import type { Env, Share } from '../types'
import { success, error } from '../lib/response'
import { signJWT, verifyJWT } from '../lib/auth'
import { verifyPassword, verifyPlainPassword } from '../lib/password'
import { DB } from '../lib/db'
import { R2Storage } from '../lib/r2'
import { getRequiredSecret } from '../lib/env'
import { getClientIp } from '../lib/security'
import { hashIp, sha256Hex } from '../lib/code'
import { cleanupExpiredShares } from '../lib/cleanup'
import { getRuntimeConfig, type RuntimeConfig } from '../lib/runtime-config'
import { checkRateLimit } from '../lib/rate-limit'

type Bindings = Env

const app = new Hono<{ Bindings: Bindings, Variables: { user: any } }>()

app.use('/admin/*', adminAuth)

app.post('/admin/login', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const password = String(body.password || '')
    const username = String(body.username || 'admin')
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
      config.enableKvRateLimit,
    )
    if (limited.limited) {
      return c.json(error('用户名或密码错误', 400), 400)
    }

    const adminUser = c.env.ADMIN_USERNAME || 'admin'
    const adminHash = c.env.ADMIN_PASSWORD_HASH
    const adminPassword = c.env.ADMIN_PASSWORD
    if (!adminHash && !adminPassword) {
      throw new Error('Missing ADMIN_PASSWORD or ADMIN_PASSWORD_HASH secret')
    }
    const sessionSecret = getRequiredSecret(c.env, 'SESSION_SECRET')

    const validUser = username === adminUser
    const validPassword = adminHash
      ? await verifyPassword(password, adminHash)
      : await verifyPlainPassword(password, adminPassword || '')
    if (!validUser || !validPassword) {
      if (ipHash) await db.incrementAbuseCounter('admin_login_failed', ipHash, bucketStart(15 * 60))
      return c.json(error('用户名或密码错误', 400), 400)
    }

    const token = await signJWT({
      sub: 'admin',
      username: adminUser,
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
    }, sessionSecret)

    await audit(db, c, 'admin_login', null, 'success', ipHash)
    c.header('Set-Cookie', `admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`)

    return c.json(success({
      token,
      user: {
        id: 'admin',
        username: adminUser,
        nickname: '管理员',
        role: 'admin',
      },
    }, '登录成功'))
  } catch (e: any) {
    return c.json(error('登录失败: ' + e.message, 500), 500)
  }
})

app.post('/admin/logout', (c) => {
  c.header('Set-Cookie', 'admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0')
  return c.json(success(null, '退出成功'))
})

app.get('/admin/stats', async (c) => {
  try {
    const db = new DB(c.env.DB)
    const stats = await db.getSystemStats()
    return c.json(success(stats))
  } catch (e: any) {
    return c.json(error('获取统计信息失败: ' + e.message, 500), 500)
  }
})

app.get('/admin/files', async (c) => {
  try {
    const page = Math.max(Number.parseInt(c.req.query('page') || '1', 10), 1)
    const pageSize = Math.min(Math.max(Number.parseInt(c.req.query('page_size') || '10', 10), 1), 100)
    const offset = (page - 1) * pageSize
    const db = new DB(c.env.DB)
    const result = await db.getSharesList(pageSize, offset)

    return c.json(success({
      items: result.items.map(adminShareDto),
      list: result.items.map(adminShareDto),
      total: result.total,
      page,
      page_size: pageSize,
    }))
  } catch (e: any) {
    return c.json(error('获取文件列表失败: ' + e.message, 500), 500)
  }
})

app.delete('/admin/files/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const db = new DB(c.env.DB)
    const share = await db.getShareById(id)
    if (!share) {
      return c.json(error('文件不存在', 404), 404)
    }

    const r2 = new R2Storage(c.env.BUCKET)
    await r2.deleteObject(share.r2_key)
    await db.deleteShareById(id)

    const pepper = getRequiredSecret(c.env, 'CODE_HASH_PEPPER')
    await audit(db, c, 'admin_delete_share', id, 'success', await hashIp(getClientIp(c), pepper))
    return c.json(success(null, '删除成功'))
  } catch (e: any) {
    return c.json(error('删除失败: ' + e.message, 500), 500)
  }
})

app.get('/admin/config', async (c) => {
  try {
    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)
    return c.json(success(adminConfigDto(config)))
  } catch (e: any) {
    return c.json(error('获取配置失败: ' + e.message, 500), 500)
  }
})

app.put('/admin/config', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const configBody = body.config || body
    const settings = settingsFromAdminConfig(configBody)
    const db = new DB(c.env.DB)
    await db.upsertSettings(settings)
    await audit(db, c, 'admin_update_config', null, 'success', null)
    const config = await getRuntimeConfig(c.env, db)
    return c.json(success(adminConfigDto(config), '配置已保存'))
  } catch (e: any) {
    return c.json(error('保存配置失败: ' + e.message, 500), 500)
  }
})

app.get('/admin/stats/trend', async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '7', 10)
    const db = new DB(c.env.DB)
    const trend = await db.getUploadTrend(days)
    return c.json(success(trend))
  } catch (e: any) {
    return c.json(error('获取趋势数据失败: ' + e.message, 500), 500)
  }
})

app.get('/admin/stats/file-types', async (c) => {
  try {
    const db = new DB(c.env.DB)
    const distribution = await db.getFileTypeDistribution()
    return c.json(success(distribution))
  } catch (e: any) {
    return c.json(error('获取文件类型分布失败: ' + e.message, 500), 500)
  }
})

app.get('/admin/logs/transfer', async (c) => {
  try {
    const page = Math.max(Number.parseInt(c.req.query('page') || '1', 10), 1)
    const pageSize = Math.min(Math.max(Number.parseInt(c.req.query('page_size') || '20', 10), 1), 100)
    const offset = (page - 1) * pageSize
    const db = new DB(c.env.DB)
    const [logs, stats] = await Promise.all([
      db.getAuditLogs(pageSize, offset),
      db.getAuditStats(),
    ])
    const items = logs.items.map((log) => ({
      id: log.id,
      operation: operationFromAction(log.action),
      action: log.action,
      file_code: log.share_id || '-',
      file_name: '-',
      file_size: 0,
      username: '',
      ip: log.ip_hash ? `${log.ip_hash.slice(0, 10)}...` : '-',
      status: log.status,
      created_at: log.created_at,
    }))
    return c.json(success({
      items,
      logs: items,
      total: logs.total,
      page,
      page_size: pageSize,
      pagination: { page, page_size: pageSize, total: logs.total },
      stats,
    }))
  } catch (e: any) {
    return c.json(error('获取日志失败: ' + e.message, 500), 500)
  }
})

app.get('/admin/maintenance/system-info', (c) => {
  return c.json(success({
    go_version: 'cloudflare-workers',
    build_time: new Date().toISOString(),
    git_commit: 'unknown',
    os_info: 'v8-isolate',
    cpu_cores: 1,
    filecodebox_version: '2.0.0-cf',
  }))
})

app.post('/admin/maintenance/clean-expired', async (c) => {
  try {
    const db = new DB(c.env.DB)
    const config = await getRuntimeConfig(c.env, db)
    const result = await cleanupExpiredShares(c.env.DB, c.env.BUCKET, config.cleanupBatchSize)
    return c.json(success({
      deleted_count: result.processed,
      deleted_r2_objects: result.deletedR2,
      aborted_uploads: result.abortedUploads,
    }, '清理成功'))
  } catch (e: any) {
    return c.json(error('清理失败: ' + e.message, 500), 500)
  }
})

async function adminAuth(c: Context<{ Bindings: Bindings, Variables: { user: any } }>, next: Next) {
  if (c.req.path === '/admin/login') {
    return next()
  }

  const token = getBearerToken(c) || getCookie(c.req.header('Cookie') || '', 'admin_session')
  if (!token) {
    return c.json(error('未授权', 401), 401)
  }

  const payload = await verifyJWT(token, getRequiredSecret(c.env, 'SESSION_SECRET'))
  if (!payload || payload.role !== 'admin') {
    return c.json(error('未授权或凭证无效', 401), 401)
  }

  c.set('user', payload)
  await next()
}

function getBearerToken(c: Context): string | null {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  return authHeader.substring(7)
}

function getCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

function adminShareDto(share: Share) {
  return {
    id: share.id,
    code: share.id,
    type: share.type,
    text: share.type === 'text',
    uuid_file_name: share.display_name,
    display_name: share.display_name,
    file_name: share.display_name,
    size: share.size_bytes,
    used_count: share.download_count,
    download_count: share.download_count,
    max_downloads: share.max_downloads,
    CreatedAt: share.created_at,
    created_at: share.created_at,
    expired_at: share.expire_at,
    expire_time: share.expire_at,
  }
}

function adminConfigDto(config: RuntimeConfig) {
  return {
    base: {
      name: config.appName,
      description: config.appDescription,
      port: 0,
      production: true,
    },
    storage: {
      type: 'r2',
      max_size: Math.floor(config.maxUploadBytes / 1024 / 1024),
      max_total_storage_bytes: config.maxTotalStorageBytes,
    },
    transfer: {
      max_count: config.defaultMaxDownloads,
      expire_default: config.defaultExpireHours,
      upload: {
        openupload: config.enablePublicUpload ? 1 : 0,
        uploadsize: config.maxUploadBytes,
        enablechunk: 1,
        chunksize: 8 * 1024 * 1024,
      },
      rate_limit: {
        enable_kv: config.enableKvRateLimit ? 1 : 0,
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

function settingsFromAdminConfig(config: any): Record<string, string> {
  const settings: Record<string, string> = {}
  if (config.base) {
    setString(settings, 'APP_NAME', config.base.name)
    setString(settings, 'APP_DESCRIPTION', config.base.description)
  }
  if (config.storage) {
    setNumber(settings, 'MAX_TOTAL_STORAGE_BYTES', config.storage.max_total_storage_bytes)
  }
  if (config.transfer) {
    setNumber(settings, 'DEFAULT_MAX_DOWNLOADS', config.transfer.max_count)
    setNumber(settings, 'DEFAULT_EXPIRE_HOURS', config.transfer.expire_default)
    if (config.transfer.upload) {
      setBoolean(settings, 'ENABLE_PUBLIC_UPLOAD', config.transfer.upload.openupload)
      setNumber(settings, 'MAX_UPLOAD_BYTES', config.transfer.upload.uploadsize)
    }
    if (config.transfer.rate_limit) {
      setBoolean(settings, 'ENABLE_KV_RATE_LIMIT', config.transfer.rate_limit.enable_kv)
      setNumber(settings, 'RATE_LIMIT_UPLOAD_PER_MINUTE', config.transfer.rate_limit.upload_per_minute)
      setNumber(settings, 'RATE_LIMIT_UPLOAD_PART_PER_MINUTE', config.transfer.rate_limit.upload_part_per_minute)
      setNumber(settings, 'RATE_LIMIT_RESOLVE_PER_MINUTE', config.transfer.rate_limit.resolve_per_minute)
      setNumber(settings, 'RATE_LIMIT_DOWNLOAD_PER_MINUTE', config.transfer.rate_limit.download_per_minute)
      setNumber(settings, 'RATE_LIMIT_AUTH_PER_15_MIN', config.transfer.rate_limit.auth_per_15_min)
    }
  }
  if (config.security) {
    setBoolean(settings, 'ENABLE_AUDIT_LOG', config.security.enable_audit_log)
    setBoolean(settings, 'ENABLE_ACCESS_LOG', config.security.enable_access_log)
    setBoolean(settings, 'REQUIRE_TURNSTILE', config.security.require_turnstile)
    setString(settings, 'TURNSTILE_SITE_KEY', config.security.turnstile_site_key)
  }
  return settings
}

function setString(settings: Record<string, string>, key: string, value: unknown) {
  if (typeof value === 'string') settings[key] = value
}

function setNumber(settings: Record<string, string>, key: string, value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (Number.isFinite(parsed) && parsed >= 0) settings[key] = String(parsed)
}

function setBoolean(settings: Record<string, string>, key: string, value: unknown) {
  if (value === undefined || value === null) return
  settings[key] = value === true || value === 1 || value === '1' || value === 'true' ? 'true' : 'false'
}

function bucketStart(windowSeconds: number): string {
  const interval = windowSeconds * 1000
  return new Date(Math.floor(Date.now() / interval) * interval).toISOString()
}

function operationFromAction(action: string): string {
  if (action.includes('download') || action.includes('resolve')) return 'download'
  if (action.includes('upload') || action.includes('create')) return 'upload'
  if (action.includes('delete')) return 'delete'
  return 'view'
}


async function audit(
  db: DB,
  c: Context,
  action: string,
  shareId: string | null,
  status: string,
  ipHash: string | null,
): Promise<void> {
  const config = await getRuntimeConfig(c.env as Env, db)
  if (!config.enableAuditLog) return
  const userAgent = c.req.header('User-Agent')
  await db.createAuditLog({
    id: crypto.randomUUID(),
    action,
    share_id: shareId,
    ip_hash: ipHash,
    user_agent_hash: userAgent ? await sha256Hex(userAgent) : null,
    status,
    created_at: new Date().toISOString(),
  })
}

export default app
