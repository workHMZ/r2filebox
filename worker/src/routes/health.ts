import { Hono } from 'hono'
import type { Env } from '../types'
import { success } from '../lib/response'

const app = new Hono<{ Bindings: Env }>()

app.get('/health', (c) => {
  return c.json(success({ runtime: 'cloudflare-workers' }, 'ok'))
})

export default app
