import { Hono } from 'hono'
import type { Env } from './types'

// Routes
import health from './routes/health'
import config from './routes/config'
import version from './routes/version'
import share from './routes/share'
import admin from './routes/admin'
import { cleanupExpiredShares } from './lib/cleanup'
import { DEFAULT_CLEANUP_BATCH_SIZE } from './lib/runtime-config'
import { error } from './lib/response'
import { securityHeaders } from './lib/security'
import { ErrorCode } from './types/errors'

const app = new Hono<{ Bindings: Env }>()

app.use('*', securityHeaders)

// Mount routes
app.route('', health)
app.route('', config)
app.route('', version)
app.route('', share)
app.route('', admin)

app.notFound((c) => {
  return c.json(error(ErrorCode.NOT_FOUND, 404, 'Not Found'), 404)
})

app.onError((cause, c) => {
  console.error('Unhandled Worker request error:', cause)
  return c.json(error(ErrorCode.INTERNAL_SERVER_ERROR, 500, 'Internal server error'), 500)
})

export default {
  fetch: app.fetch,

  // Scheduled Cron Trigger for Cleanup
  async scheduled(_controller: ScheduledController, env: Env) {
    // Let a rejection propagate so Cloudflare records the Cron invocation as
    // failed in Past Events instead of silently reporting success.
    requireSuccessfulCleanup(await cleanupExpiredShares(env.DB, env.BUCKET, DEFAULT_CLEANUP_BATCH_SIZE))
  },
} satisfies ExportedHandler<Env>

export function requireSuccessfulCleanup(result: { failures: number }): void {
  if (result.failures > 0) {
    throw new Error(`Scheduled cleanup completed with ${result.failures} failed operation(s)`)
  }
}
