import { Hono } from 'hono'
import type { Env } from './types'

// Routes
import health from './routes/health'
import config from './routes/config'
import version from './routes/version'
import share from './routes/share'
import admin from './routes/admin'
import { cleanupExpiredShares } from './lib/cleanup'
import { securityHeaders } from './lib/security'

const app = new Hono<{ Bindings: Env }>()

app.use('*', securityHeaders)

// Mount routes
app.route('', health)
app.route('', config)
app.route('', version)
app.route('', share)
app.route('', admin)

// SPA Fallback for frontend — only needed for unmatched API-like paths.
// Static asset routing and SPA index.html fallback are handled by the
// Workers Static Assets layer (not_found_handling = "single-page-application"
// in wrangler.toml), so the worker only sees paths listed in run_worker_first.
app.all('*', (c) => {
  return c.json({ code: 404, message: 'Not Found', data: null }, 404)
})

export default {
  fetch: app.fetch,

  // Scheduled Cron Trigger for Cleanup
  async scheduled(_controller: ScheduledController, env: Env) {
    const batchSize = parseInt(env.CLEANUP_BATCH_SIZE || '100')
    // Let a rejection propagate so Cloudflare records the Cron invocation as
    // failed in Past Events instead of silently reporting success.
    requireSuccessfulCleanup(await cleanupExpiredShares(env.DB, env.BUCKET, batchSize))
  },
} satisfies ExportedHandler<Env>

export function requireSuccessfulCleanup(result: { failures: number }): void {
  if (result.failures > 0) {
    throw new Error(`Scheduled cleanup completed with ${result.failures} failed operation(s)`)
  }
}
