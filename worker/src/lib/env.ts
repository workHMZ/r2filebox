import type { Env } from '../types'

const MAX_HARD_UPLOAD_BYTES = 95 * 1024 * 1024

export function boolEnv(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback
  return value.toLowerCase() === 'true' || value === '1'
}

export function intEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getMaxUploadBytes(env: Env): number {
  return Math.min(intEnv(env.MAX_UPLOAD_BYTES, 50 * 1024 * 1024), MAX_HARD_UPLOAD_BYTES)
}

export function getRequiredSecret(env: Env, key: keyof Env): string {
  const value = env[key]
  if (typeof value !== 'string' || value.length < 16) {
    throw new Error(`${String(key)} is not configured`)
  }
  return value
}

export function publicConfig(env: Env) {
  return {
    appName: env.APP_NAME || 'R2FileBox',
    appDescription: env.APP_DESCRIPTION || 'Private code-based file sharing on Cloudflare',
    maxUploadBytes: getMaxUploadBytes(env),
    defaultExpireHours: intEnv(env.DEFAULT_EXPIRE_HOURS, 24),
    maxExpireHours: intEnv(env.MAX_EXPIRE_HOURS, 168),
    requireTurnstile: boolEnv(env.REQUIRE_TURNSTILE, false),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || undefined,
  }
}
