import { Hono } from 'hono'
import type { Env } from '../types'
import { success } from '../lib/response'
import { getRuntimeConfig } from '../lib/runtime-config'
import { DB } from '../lib/db'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/config', async (c) => {
  const config = await getRuntimeConfig(c.env, new DB(c.env.DB))
  return c.json(success({
    name: config.appName,
    appName: config.appName,
    description: config.appDescription,
    appDescription: config.appDescription,
    uploadSize: Math.floor(config.maxUploadBytes / 1024 / 1024),
    maxUploadBytes: config.maxUploadBytes,
    defaultExpireHours: config.defaultExpireHours,
    maxExpireHours: config.maxExpireHours,
    requireTurnstile: config.requireTurnstile,
    turnstileSiteKey: config.turnstileSiteKey,
    enableChunk: 1,
    openUpload: config.enablePublicUpload ? 1 : 0,
    enableFileShare: config.enableFileShare,
    enableTextShare: config.enableTextShare,
    expireStyle: ['minute', 'hour', 'day', 'week'],
    initialized: true,
  }))
})

export default app
