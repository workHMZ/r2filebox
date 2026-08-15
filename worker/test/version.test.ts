import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('/api/version route', () => {
  it('returns version, commit hash, and build timestamp', async () => {
    const response = await SELF.fetch('https://example.test/api/version')
    expect(response.status).toBe(200)

    const body = await response.json<{
      code: number
      success: boolean
      data: {
        version: string
        commit_hash: string
        short_hash: string
        build_time: string | null
      }
    }>()

    expect(body.code).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.version).toBe('2.3.2')
    expect(body.data.commit_hash).toBe('dev')
    expect(body.data.short_hash).toBe('dev')
    expect(body.data.build_time).toEqual(expect.any(String))
    expect(Number.isNaN(Date.parse(body.data.build_time || ''))).toBe(false)
  })
})
