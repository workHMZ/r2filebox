import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('API error contract', () => {
  it('returns an English fallback and stable error code for invalid share input', async () => {
    const response = await SELF.fetch('https://example.test/api/share/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'invalid!' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      code: 404,
      error_code: 'api.share.notFound',
      message: 'Share not found or expired',
      data: null,
      success: false,
    })
  })

  it('classifies a missing upload token as an invalid session', async () => {
    const response = await SELF.fetch('https://example.test/api/share/file/part', {
      method: 'PUT',
      headers: { 'X-Part-Number': '1' },
      body: 'part',
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error_code: 'api.share.invalidUploadSession',
      message: 'Invalid upload session',
    })
  })

  it('uses English for direct download failures that bypass the frontend translator', async () => {
    const response = await SELF.fetch('https://example.test/api/share/download/not-a-share-id')

    expect(response.status).toBe(404)
    await expect(response.text()).resolves.toBe('Share code invalid or file unavailable')
  })

})
