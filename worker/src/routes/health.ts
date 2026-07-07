import { Hono } from 'hono'
import type { Env } from '../types'
import { success } from '../lib/response'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => {
  return c.json({ ok: true, runtime: 'cloudflare-workers' })
})

app.get('/health', (c) => {
  return c.json(success({ runtime: 'cloudflare-workers' }, 'ok'))
})

app.get('/live', (c) => c.json(success({ runtime: 'cloudflare-workers' })))
app.get('/ready', (c) => c.json(success({ runtime: 'cloudflare-workers' })))
app.get('/ping', (c) => c.json(success({ runtime: 'cloudflare-workers' })))
app.get('/api/v1/ping', (c) => c.json(success({ runtime: 'cloudflare-workers' })))

export default app
