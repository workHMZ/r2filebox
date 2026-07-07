import type { Env } from '../types'
import { DB } from './db'
import { boolEnv, getMaxUploadBytes, intEnv } from './env'

export interface RuntimeConfig {
  appName: string
  appDescription: string
  codeLength: number
  maxUploadBytes: number
  maxTotalStorageBytes: number
  defaultExpireHours: number
  maxExpireHours: number
  defaultMaxDownloads: number
  cleanupBatchSize: number
  enableTextShare: boolean
  enableFileShare: boolean
  enablePublicUpload: boolean
  enableAuditLog: boolean
  enableAccessLog: boolean
  enableKvRateLimit: boolean
  requireTurnstile: boolean
  turnstileSiteKey?: string
  rateLimitUploadPerMinute: number
  rateLimitUploadPartPerMinute: number
  rateLimitResolvePerMinute: number
  rateLimitDownloadPerMinute: number
  rateLimitAuthPer15Min: number
}

export async function getRuntimeConfig(env: Env, db = new DB(env.DB)): Promise<RuntimeConfig> {
  const settings = await db.getSettings().catch(() => ({}))
  return buildRuntimeConfig(env, settings)
}

export function buildRuntimeConfig(env: Env, settings: Record<string, string> = {}): RuntimeConfig {
  return {
    appName: stringValue(settings.APP_NAME, env.APP_NAME, 'R2FileBox'),
    appDescription: stringValue(settings.APP_DESCRIPTION, env.APP_DESCRIPTION, 'Private code-based file sharing on Cloudflare'),
    codeLength: numberValue(settings.CODE_LENGTH, env.CODE_LENGTH, 12),
    maxUploadBytes: Math.min(numberValue(settings.MAX_UPLOAD_BYTES, env.MAX_UPLOAD_BYTES, getMaxUploadBytes(env)), getMaxUploadBytes(env)),
    maxTotalStorageBytes: numberValue(settings.MAX_TOTAL_STORAGE_BYTES, env.MAX_TOTAL_STORAGE_BYTES, 8 * 1024 * 1024 * 1024),
    defaultExpireHours: numberValue(settings.DEFAULT_EXPIRE_HOURS, env.DEFAULT_EXPIRE_HOURS, 24),
    maxExpireHours: numberValue(settings.MAX_EXPIRE_HOURS, env.MAX_EXPIRE_HOURS, 168),
    defaultMaxDownloads: numberValue(settings.DEFAULT_MAX_DOWNLOADS, env.DEFAULT_MAX_DOWNLOADS, 10),
    cleanupBatchSize: numberValue(settings.CLEANUP_BATCH_SIZE, env.CLEANUP_BATCH_SIZE, 100),
    enableTextShare: booleanValue(settings.ENABLE_TEXT_SHARE, env.ENABLE_TEXT_SHARE, true),
    enableFileShare: booleanValue(settings.ENABLE_FILE_SHARE, env.ENABLE_FILE_SHARE, true),
    enablePublicUpload: booleanValue(settings.ENABLE_PUBLIC_UPLOAD, env.ENABLE_PUBLIC_UPLOAD, true),
    enableAuditLog: booleanValue(settings.ENABLE_AUDIT_LOG, env.ENABLE_AUDIT_LOG, true),
    enableAccessLog: booleanValue(settings.ENABLE_ACCESS_LOG, env.ENABLE_ACCESS_LOG, false),
    enableKvRateLimit: booleanValue(settings.ENABLE_KV_RATE_LIMIT, env.ENABLE_KV_RATE_LIMIT, true),
    requireTurnstile: booleanValue(settings.REQUIRE_TURNSTILE, env.REQUIRE_TURNSTILE, false),
    turnstileSiteKey: stringValue(settings.TURNSTILE_SITE_KEY, env.TURNSTILE_SITE_KEY, '') || undefined,
    rateLimitUploadPerMinute: numberValue(settings.RATE_LIMIT_UPLOAD_PER_MINUTE, env.RATE_LIMIT_UPLOAD_PER_MINUTE, 10),
    rateLimitUploadPartPerMinute: numberValue(settings.RATE_LIMIT_UPLOAD_PART_PER_MINUTE, env.RATE_LIMIT_UPLOAD_PART_PER_MINUTE, 80),
    rateLimitResolvePerMinute: numberValue(settings.RATE_LIMIT_RESOLVE_PER_MINUTE, env.RATE_LIMIT_RESOLVE_PER_MINUTE, 120),
    rateLimitDownloadPerMinute: numberValue(settings.RATE_LIMIT_DOWNLOAD_PER_MINUTE, env.RATE_LIMIT_DOWNLOAD_PER_MINUTE, 120),
    rateLimitAuthPer15Min: numberValue(settings.RATE_LIMIT_AUTH_PER_15_MIN, env.RATE_LIMIT_AUTH_PER_15_MIN, 20),
  }
}

export function publicRuntimeConfig(config: RuntimeConfig) {
  return {
    appName: config.appName,
    appDescription: config.appDescription,
    maxUploadBytes: config.maxUploadBytes,
    defaultExpireHours: config.defaultExpireHours,
    maxExpireHours: config.maxExpireHours,
    requireTurnstile: config.requireTurnstile,
    turnstileSiteKey: config.turnstileSiteKey,
    enableFileShare: config.enableFileShare,
    enableTextShare: config.enableTextShare,
    enablePublicUpload: config.enablePublicUpload,
  }
}

function stringValue(setting: string | undefined, envValue: string | undefined, fallback: string): string {
  if (setting !== undefined) return setting
  return envValue || fallback
}

function numberValue(setting: string | undefined, envValue: string | undefined, fallback: number): number {
  if (setting !== undefined) return intEnv(setting, fallback)
  return intEnv(envValue, fallback)
}

function booleanValue(setting: string | undefined, envValue: string | undefined, fallback: boolean): boolean {
  if (setting !== undefined) return boolEnv(setting, fallback)
  return boolEnv(envValue, fallback)
}
