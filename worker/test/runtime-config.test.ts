import { env, SELF } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import type { DB } from '../src/lib/db'
import {
  getRuntimeConfig,
  RuntimeConfigUnavailableError,
} from '../src/lib/runtime-config'
import type { Env } from '../src/types'

describe('runtime configuration', () => {
  it('uses deployment defaults when the settings table is readable but empty', async () => {
    const db = {
      getSettings: vi.fn().mockResolvedValue({}),
    } as unknown as DB

    const config = await getRuntimeConfig({
      APP_NAME: 'Deployment Name',
      MAX_UPLOAD_BYTES: '52428800',
      ENABLE_PUBLIC_UPLOAD: 'true',
      REQUIRE_TURNSTILE: 'false',
    } as unknown as Env, db)

    expect(config).toMatchObject({
      appName: 'Deployment Name',
      maxUploadBytes: 52428800,
      enablePublicUpload: true,
      requireTurnstile: false,
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
      'maxUploadBytes',
      'name',
      'openUpload',
      'requireTurnstile',
      'turnstileSiteKey',
    ])
  })
})
