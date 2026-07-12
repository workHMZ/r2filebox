import type { Env } from '../types'
import { DB } from './db'

export interface RateLimitResult {
  limited: boolean
  count: number
  limit: number
  resetAt: string
  source: 'kv' | 'd1' | 'none'
}

export async function checkRateLimit(
  env: Env,
  db: DB,
  action: string,
  identity: string | null,
  windowSeconds: number,
  maxCount: number,
  useKv: boolean,
): Promise<RateLimitResult> {
  if (!identity || maxCount <= 0 || windowSeconds <= 0) {
    return result(false, 0, maxCount, windowSeconds, 'none')
  }

  if (useKv && env.RATE_LIMIT) {
    const kvResult = await checkKvRateLimit(env.RATE_LIMIT, action, identity, windowSeconds, maxCount)
    if (kvResult) return kvResult
  }

  const bucket = bucketStart(windowSeconds)
  const count = await db.incrementAbuseCounter(action, identity, bucket)
  return result(count > maxCount, count, maxCount, windowSeconds, 'd1')
}

async function checkKvRateLimit(
  kv: KVNamespace,
  action: string,
  identity: string,
  windowSeconds: number,
  maxCount: number,
): Promise<RateLimitResult | null> {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000))
  const key = `rl:${action}:${identity}:${bucket}`
  const ttl = Math.max(60, windowSeconds * 2)

  try {
    const current = await kv.get<{ count?: number }>(key, 'json')
    const count = Math.max(Number(current?.count || 0), 0)
    if (count >= maxCount) {
      return result(true, count, maxCount, windowSeconds, 'kv')
    }

    await kv.put(key, JSON.stringify({ count: count + 1, updatedAt: new Date().toISOString() }), {
      expirationTtl: ttl,
    })
    return result(false, count + 1, maxCount, windowSeconds, 'kv')
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes('429') || message.toLowerCase().includes('too many')) {
      return result(true, maxCount, maxCount, windowSeconds, 'kv')
    }
    console.error(`KV rate limit failed for ${action}:`, e)
    return null
  }
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
