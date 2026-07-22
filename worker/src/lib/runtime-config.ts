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
  enableNativeRateLimit: boolean
  requireTurnstile: boolean
  turnstileSiteKey?: string
  rateLimitUploadPerMinute: number
  rateLimitUploadPartPerMinute: number
  rateLimitResolvePerMinute: number
  rateLimitDownloadPerMinute: number
  rateLimitAuthPer15Min: number
}

export class RuntimeConfigUnavailableError extends Error {
  override readonly name = 'RuntimeConfigUnavailableError'

  constructor(cause: unknown) {
    super('Runtime configuration is temporarily unavailable', { cause })
  }
}

export async function getRuntimeConfig(env: Env, db = new DB(env.DB)): Promise<RuntimeConfig> {
  let settings: Record<string, string>
  try {
    settings = await db.getSettings()
  } catch (cause) {
    // Security switches live in D1. Falling back to permissive defaults after
    // a read failure could silently re-enable uploads or disable Turnstile.
    throw new RuntimeConfigUnavailableError(cause)
  }
  return buildRuntimeConfig(env, settings)
}

export function buildRuntimeConfig(env: Env, settings: Record<string, string> = {}): RuntimeConfig {
  const maxUploadLimit = getMaxUploadBytes(env)
  const minUploadBytes = Math.min(1024 * 1024, maxUploadLimit)

  return {
    appName: stringValue(settings.APP_NAME, env.APP_NAME, 'R2FileBox'),
    appDescription: stringValue(settings.APP_DESCRIPTION, env.APP_DESCRIPTION, 'Private code-based file sharing on Cloudflare'),
    codeLength: clamp(numberValue(settings.CODE_LENGTH, env.CODE_LENGTH, 12), 6, 64),
    maxUploadBytes: clamp(numberValue(settings.MAX_UPLOAD_BYTES, env.MAX_UPLOAD_BYTES, maxUploadLimit), minUploadBytes, maxUploadLimit),
    maxTotalStorageBytes: Math.max(numberValue(settings.MAX_TOTAL_STORAGE_BYTES, env.MAX_TOTAL_STORAGE_BYTES, 8 * 1024 * 1024 * 1024), 1),
    defaultExpireHours: clamp(numberValue(settings.DEFAULT_EXPIRE_HOURS, env.DEFAULT_EXPIRE_HOURS, 24), 1, 8760),
    maxExpireHours: clamp(numberValue(settings.MAX_EXPIRE_HOURS, env.MAX_EXPIRE_HOURS, 168), 1, 8760),
    defaultMaxDownloads: clamp(numberValue(settings.DEFAULT_MAX_DOWNLOADS, env.DEFAULT_MAX_DOWNLOADS, 10), 1, 1_000_000),
    cleanupBatchSize: clamp(numberValue(settings.CLEANUP_BATCH_SIZE, env.CLEANUP_BATCH_SIZE, 100), 1, 100),
    enableTextShare: booleanValue(settings.ENABLE_TEXT_SHARE, env.ENABLE_TEXT_SHARE, true),
    enableFileShare: booleanValue(settings.ENABLE_FILE_SHARE, env.ENABLE_FILE_SHARE, true),
    enablePublicUpload: booleanValue(settings.ENABLE_PUBLIC_UPLOAD, env.ENABLE_PUBLIC_UPLOAD, true),
    enableAuditLog: booleanValue(settings.ENABLE_AUDIT_LOG, env.ENABLE_AUDIT_LOG, true),
    enableAccessLog: booleanValue(settings.ENABLE_ACCESS_LOG, env.ENABLE_ACCESS_LOG, false),
    enableNativeRateLimit: booleanValue(settings.ENABLE_NATIVE_RATE_LIMIT, env.ENABLE_NATIVE_RATE_LIMIT, true),
    requireTurnstile: booleanValue(settings.REQUIRE_TURNSTILE, env.REQUIRE_TURNSTILE, false),
    turnstileSiteKey: stringValue(settings.TURNSTILE_SITE_KEY, env.TURNSTILE_SITE_KEY, '') || undefined,
    rateLimitUploadPerMinute: clamp(numberValue(settings.RATE_LIMIT_UPLOAD_PER_MINUTE, env.RATE_LIMIT_UPLOAD_PER_MINUTE, 10), 1, 600),
    rateLimitUploadPartPerMinute: clamp(numberValue(settings.RATE_LIMIT_UPLOAD_PART_PER_MINUTE, env.RATE_LIMIT_UPLOAD_PART_PER_MINUTE, 80), 1, 2000),
    rateLimitResolvePerMinute: clamp(numberValue(settings.RATE_LIMIT_RESOLVE_PER_MINUTE, env.RATE_LIMIT_RESOLVE_PER_MINUTE, 120), 1, 2000),
    rateLimitDownloadPerMinute: clamp(numberValue(settings.RATE_LIMIT_DOWNLOAD_PER_MINUTE, env.RATE_LIMIT_DOWNLOAD_PER_MINUTE, 120), 1, 2000),
    rateLimitAuthPer15Min: clamp(numberValue(settings.RATE_LIMIT_AUTH_PER_15_MIN, env.RATE_LIMIT_AUTH_PER_15_MIN, 20), 1, 300),
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
