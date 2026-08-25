import { Hono } from 'hono'
import type { Env } from '../types'
import { error, success } from '../lib/response'
import { ErrorCode } from '../types/errors'
import { getRuntimeConfig, RuntimeConfigUnavailableError } from '../lib/runtime-config'
import { DB } from '../lib/db'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/config', async (c) => {
  try {
    const config = await getRuntimeConfig(c.env, new DB(c.env.DB))
    return c.json(success({
      name: config.appName,
      description: config.appDescription,
      maxUploadBytes: config.maxUploadBytes,
      maxTextBytes: config.maxTextBytes,
      defaultExpireHours: config.defaultExpireHours,
      maxExpireHours: config.maxExpireHours,
      requireTurnstile: config.requireTurnstile,
      turnstileSiteKey: config.turnstileSiteKey || '',
      openUpload: config.enablePublicUpload ? 1 : 0,
      enableFileShare: config.enableFileShare,
      enableTextShare: config.enableTextShare,
      expireStyle: ['minute', 'hour', 'day', 'week'],
    }))
  } catch (cause) {
    if (cause instanceof RuntimeConfigUnavailableError) {
      console.error('get public runtime config failed:', cause)
      return c.json(error(ErrorCode.SERVICE_UNAVAILABLE, 503, 'Service temporarily unavailable, please try again later'), 503)
    }
    throw cause
  }
})

export default app
