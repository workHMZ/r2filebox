import type { Env } from '../types'
import { DB } from './db'
import { boolEnv, intEnv } from './env'

const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const MAX_UPLOAD_BYTES_LIMIT = 95 * 1024 * 1024
export const DEFAULT_CLEANUP_BATCH_SIZE = 100

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
  const minUploadBytes = 1024 * 1024
  const maxExpireHours = clamp(numberValue(settings.MAX_EXPIRE_HOURS, 168), 1, 8760)

  return {
    appName: stringValue(settings.APP_NAME, 'R2FileBox'),
    appDescription: stringValue(settings.APP_DESCRIPTION, 'Private code-based file sharing on Cloudflare R2'),
    codeLength: clamp(numberValue(settings.CODE_LENGTH, 12), 6, 64),
    maxUploadBytes: clamp(numberValue(settings.MAX_UPLOAD_BYTES, DEFAULT_MAX_UPLOAD_BYTES), minUploadBytes, MAX_UPLOAD_BYTES_LIMIT),
    maxTotalStorageBytes: Math.max(numberValue(settings.MAX_TOTAL_STORAGE_BYTES, 8 * 1024 * 1024 * 1024), 1),
    defaultExpireHours: clamp(numberValue(settings.DEFAULT_EXPIRE_HOURS, 24), 1, maxExpireHours),
    maxExpireHours,
    defaultMaxDownloads: clamp(numberValue(settings.DEFAULT_MAX_DOWNLOADS, 10), 1, 1_000_000),
    cleanupBatchSize: DEFAULT_CLEANUP_BATCH_SIZE,
    enableTextShare: booleanValue(settings.ENABLE_TEXT_SHARE, true),
    enableFileShare: booleanValue(settings.ENABLE_FILE_SHARE, true),
    enablePublicUpload: booleanValue(settings.ENABLE_PUBLIC_UPLOAD, true),
    enableAuditLog: booleanValue(settings.ENABLE_AUDIT_LOG, true),
    enableAccessLog: booleanValue(settings.ENABLE_ACCESS_LOG, false),
    enableNativeRateLimit: booleanValue(settings.ENABLE_NATIVE_RATE_LIMIT, true),
    requireTurnstile: booleanValue(settings.REQUIRE_TURNSTILE, env.REQUIRE_TURNSTILE, false),
    turnstileSiteKey: stringValue(settings.TURNSTILE_SITE_KEY, '', env.TURNSTILE_SITE_KEY) || undefined,
    rateLimitUploadPerMinute: clamp(numberValue(settings.RATE_LIMIT_UPLOAD_PER_MINUTE, 10), 1, 600),
    rateLimitUploadPartPerMinute: clamp(numberValue(settings.RATE_LIMIT_UPLOAD_PART_PER_MINUTE, 80), 1, 2000),
    rateLimitResolvePerMinute: clamp(numberValue(settings.RATE_LIMIT_RESOLVE_PER_MINUTE, 120), 1, 2000),
    rateLimitDownloadPerMinute: clamp(numberValue(settings.RATE_LIMIT_DOWNLOAD_PER_MINUTE, 120), 1, 2000),
    rateLimitAuthPer15Min: clamp(numberValue(settings.RATE_LIMIT_AUTH_PER_15_MIN, 20), 1, 300),
  }
}

function stringValue(setting: string | undefined, fallback: string, deploymentValue?: string): string {
  if (setting !== undefined) return setting
  return deploymentValue || fallback
}

function numberValue(setting: string | undefined, fallback: number): number {
  return intEnv(setting, fallback)
}

function booleanValue(setting: string | undefined, fallback: boolean): boolean
function booleanValue(setting: string | undefined, deploymentValue: string | undefined, fallback: boolean): boolean
function booleanValue(
  setting: string | undefined,
  deploymentValueOrFallback: string | boolean | undefined,
  fallback?: boolean,
): boolean {
  const effectiveFallback = typeof deploymentValueOrFallback === 'boolean'
    ? deploymentValueOrFallback
    : fallback ?? false
  if (setting !== undefined) return boolEnv(setting, effectiveFallback)
  if (typeof deploymentValueOrFallback === 'boolean') return deploymentValueOrFallback
  return boolEnv(deploymentValueOrFallback, effectiveFallback)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
