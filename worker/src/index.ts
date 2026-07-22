import { Hono } from 'hono'
import type { Env } from './types'

// Routes
import health from './routes/health'
import config from './routes/config'
import share from './routes/share'
import admin from './routes/admin'
import { cleanupExpiredShares } from './lib/cleanup'
import { securityHeaders } from './lib/security'

const app = new Hono<{ Bindings: Env }>()

app.use('*', securityHeaders)

// Mount routes
app.route('', health)
app.route('', config)
app.route('', share)
app.route('', admin)

// SPA Fallback for frontend
app.get('*', async (c) => {
  // If it's an API route that somehow wasn't matched, return 404 JSON
  if (
    c.req.path.startsWith('/api') ||
    c.req.path.startsWith('/admin') ||
    c.req.path.startsWith('/health')
  ) {
    return c.json({ code: 404, message: 'Not Found', data: null }, 404)
  }

  // Otherwise, fallback to ASSETS (Cloudflare Workers Static Assets)
  if (c.env.ASSETS) {
    try {
      let res = await c.env.ASSETS.fetch(c.req.raw)
      if (res.status === 404) {
        // If not found, serve index.html for Vue SPA
        const indexReq = new Request(new URL('/', c.req.url))
        res = await c.env.ASSETS.fetch(indexReq)
      }
      return res
    } catch (e) {
      console.error('ASSETS fetch error', e)
    }
  }

  return c.text('Not Found', 404)
})

export default {
  fetch: app.fetch,

  // Scheduled Cron Trigger for Cleanup
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const batchSize = parseInt(env.CLEANUP_BATCH_SIZE || '100')
    ctx.waitUntil(cleanupExpiredShares(env.DB, env.BUCKET, batchSize))
  }
}
