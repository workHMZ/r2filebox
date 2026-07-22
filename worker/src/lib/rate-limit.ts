import type { Env } from '../types'
import { DB } from './db'

export interface RateLimitResult {
  limited: boolean
  count: number
  limit: number
  resetAt: string
  source: 'native' | 'd1' | 'none'
}

type NativeRateLimitAction = 'upload' | 'upload_part' | 'resolve' | 'download'

export async function checkRateLimit(
  env: Env,
  db: DB,
  action: string,
  identity: string | null,
  windowSeconds: number,
  maxCount: number,
  useNativeLimiter: boolean,
): Promise<RateLimitResult> {
  if (!identity || maxCount <= 0 || windowSeconds <= 0) {
    return result(false, 0, maxCount, windowSeconds, 'none')
  }

  const nativeLimiter = useNativeLimiter ? nativeRateLimiter(env, action) : undefined
  if (nativeLimiter) {
    try {
      const nativeResult = await nativeLimiter.limit({ key: identity })
      if (!nativeResult.success) {
        return result(true, maxCount, maxCount, windowSeconds, 'native')
      }
    } catch (cause: unknown) {
      console.error('Native rate limiter unavailable; falling back to the exact D1 limit', {
        action,
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  const bucket = bucketStart(windowSeconds)
  const count = await db.incrementAbuseCounter(action, identity, bucket, maxCount)
  return result(count > maxCount, count, maxCount, windowSeconds, 'd1')
}

function nativeRateLimiter(env: Env, action: string): RateLimit | undefined {
  const bindings: Record<NativeRateLimitAction, RateLimit> = {
    upload: env.UPLOAD_RATE_LIMITER,
    upload_part: env.UPLOAD_PART_RATE_LIMITER,
    resolve: env.RESOLVE_RATE_LIMITER,
    download: env.DOWNLOAD_RATE_LIMITER,
  }
  return action in bindings ? bindings[action as NativeRateLimitAction] : undefined
}

function bucketStart(windowSeconds: number): string {
  const interval = windowSeconds * 1000
  return new Date(Math.floor(Date.now() / interval) * interval).toISOString()
}

function result(
  limited: boolean,
  count: number,
  limit: number,
  windowSeconds: number,
  source: RateLimitResult['source'],
): RateLimitResult {
  return {
    limited,
    count,
    limit,
    resetAt: new Date(Math.ceil(Date.now() / (windowSeconds * 1000)) * (windowSeconds * 1000)).toISOString(),
    source,
  }
}
