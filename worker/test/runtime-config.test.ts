import { env, SELF } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import type { DB } from '../src/lib/db'
import {
  getRuntimeConfig,
  RuntimeConfigUnavailableError,
} from '../src/lib/runtime-config'
import type { Env } from '../src/types'

describe('runtime configuration', () => {
  it('uses application defaults when the settings table is readable but empty', async () => {
    const db = {
      getSettings: vi.fn().mockResolvedValue({}),
    } as unknown as DB

    const config = await getRuntimeConfig({} as Env, db)

    expect(config).toMatchObject({
      appName: 'R2FileBox',
      appDescription: 'Private code-based file sharing on Cloudflare R2',
      maxUploadBytes: 52428800,
      // Text shares stay capped at 1 MiB even when files may be much larger.
      maxTextBytes: 1048576,
      enablePublicUpload: true,
      requireTurnstile: false,
    })
  })

  it('uses D1 settings instead of deployment variables for administrator configuration', async () => {
    const db = {
      getSettings: vi.fn().mockResolvedValue({
        APP_NAME: 'Configured Name',
        MAX_UPLOAD_BYTES: String(64 * 1024 * 1024),
        MAX_EXPIRE_HOURS: '720',
        ENABLE_TEXT_SHARE: 'false',
        RATE_LIMIT_DOWNLOAD_PER_MINUTE: '42',
      }),
    } as unknown as DB

    const config = await getRuntimeConfig({} as Env, db)

    expect(config).toMatchObject({
      appName: 'Configured Name',
      maxUploadBytes: 64 * 1024 * 1024,
      maxTextBytes: 1048576,
      maxExpireHours: 720,
      enableTextShare: false,
      rateLimitDownloadPerMinute: 42,
    })
  })

  it('fails closed instead of using permissive defaults when D1 cannot be read', async () => {
    const db = {
      getSettings: vi.fn().mockRejectedValue(new Error('D1 unavailable')),
    } as unknown as DB

    await expect(getRuntimeConfig({} as Env, db)).rejects.toBeInstanceOf(
      RuntimeConfigUnavailableError,
    )
  })

  it('returns 503 when the public config route cannot read D1 settings', async () => {
    const response = await SELF.fetch('https://example.test/api/config')

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 503,
      success: false,
    })
  })

  it('serves deployment defaults when an empty settings table is available', async () => {
    await env.DB.prepare(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run()

    const response = await SELF.fetch('https://example.test/api/config')

    expect(response.status).toBe(200)
    const body = await response.json<{
      code: number
      success: boolean
      data: Record<string, unknown>
    }>()
    expect(body).toMatchObject({
      code: 200,
      success: true,
      data: {
        openUpload: 1,
        enableFileShare: true,
        enableTextShare: true,
      },
    })
    expect(Object.keys(body.data).sort()).toEqual([
      'defaultExpireHours',
      'description',
      'enableFileShare',
      'enableTextShare',
      'expireStyle',
      'maxExpireHours',
      'maxTextBytes',
      'maxUploadBytes',
      'name',
      'openUpload',
      'requireTurnstile',
      'turnstileSiteKey',
    ])
  })
})
