import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('health routes', () => {
  it('serves the public health contract in the Workers runtime', async () => {
    const response = await SELF.fetch('https://example.test/health')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    await expect(response.json()).resolves.toMatchObject({
      code: 200,
      message: 'ok',
      data: { runtime: 'cloudflare-workers' },
    })
  })

  it('returns JSON for an unknown API route', async () => {
    const response = await SELF.fetch('https://example.test/api/not-found')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      code: 404,
      message: 'Not Found',
      data: null,
    })
  })

  it.each([
    ['GET', '/api/health'],
    ['GET', '/api/v1/ping'],
    ['GET', '/live'],
    ['GET', '/ready'],
    ['GET', '/ping'],
    ['POST', '/share/text/'],
    ['POST', '/share/file/'],
    ['POST', '/api/share/file'],
  ])('does not expose the retired %s %s route', async (method, path) => {
    const response = await SELF.fetch(`https://example.test${path}`, { method })

    expect(response.status).toBe(404)
  })
})
