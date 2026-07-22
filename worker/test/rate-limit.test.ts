import { env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkRateLimit } from '../src/lib/rate-limit'
import type { Env } from '../src/types'
import { DB } from '../src/lib/db'

function bindings(count: number, nativeSuccess = true) {
  const first = vi.fn().mockResolvedValue({ count })
  const bind = vi.fn().mockReturnValue({ first })
  const prepare = vi.fn().mockReturnValue({ bind })
  const limit = vi.fn().mockResolvedValue({ success: nativeSuccess })
  const env = {
    DB: { prepare },
    UPLOAD_RATE_LIMITER: { limit },
  } as unknown as Env

  return { env, db: new DB(env.DB), first, bind, prepare, limit }
}

describe('checkRateLimit', () => {
  beforeAll(async () => {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS abuse_counters (
        key TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        bucket_start TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `).run()
  })

  beforeEach(async () => {
    await env.DB.exec('DELETE FROM abuse_counters')
  })

  it('short-circuits on the native coarse limit', async () => {
    const fixture = bindings(1, false)
    const result = await checkRateLimit(
      fixture.env,
      fixture.db,
      'upload',
      'ip-hash',
      60,
      10,
      true,
    )

    expect(result).toMatchObject({ limited: true, source: 'native', limit: 10 })
    expect(fixture.limit).toHaveBeenCalledWith({ key: 'ip-hash' })
    expect(fixture.prepare).not.toHaveBeenCalled()
  })

  it('enforces the configurable exact limit with one atomic D1 statement', async () => {
    const fixture = bindings(11)
    const result = await checkRateLimit(
      fixture.env,
      fixture.db,
      'upload',
      'ip-hash',
      60,
      10,
      true,
    )

    expect(result).toMatchObject({ limited: true, count: 11, source: 'd1', limit: 10 })
    expect(fixture.prepare).toHaveBeenCalledTimes(1)
    expect(fixture.prepare.mock.calls[0][0]).toContain('RETURNING count')
    expect(fixture.bind).toHaveBeenCalledTimes(1)
    expect(fixture.first).toHaveBeenCalledTimes(1)
  })

  it('keeps administrator authentication on the exact D1 limiter only', async () => {
    const fixture = bindings(3)
    const result = await checkRateLimit(
      fixture.env,
      fixture.db,
      'admin_login',
      'ip-hash',
      15 * 60,
      20,
      false,
    )

    expect(result).toMatchObject({ limited: false, count: 3, source: 'd1', limit: 20 })
    expect(fixture.limit).not.toHaveBeenCalled()
    expect(fixture.prepare).toHaveBeenCalledTimes(1)
  })

  it('executes the atomic UPSERT against the Workers D1 implementation', async () => {
    const db = new DB(env.DB)
    const first = await checkRateLimit(env as Env, db, 'admin_login', 'real-d1-ip', 900, 1, false)
    const second = await checkRateLimit(env as Env, db, 'admin_login', 'real-d1-ip', 900, 1, false)
    const laterBlocked = await checkRateLimit(env as Env, db, 'admin_login', 'real-d1-ip', 900, 1, false)
    const stored = await env.DB.prepare('SELECT count FROM abuse_counters').first<{ count: number }>()

    expect(first).toMatchObject({ limited: false, count: 1, source: 'd1' })
    expect(second).toMatchObject({ limited: true, count: 2, source: 'd1' })
    expect(laterBlocked).toMatchObject({ limited: true, count: 2, source: 'd1' })
    expect(stored?.count).toBe(2)
  })
})
