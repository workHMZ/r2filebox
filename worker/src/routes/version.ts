import { Hono } from 'hono'
import type { Env } from '../types'
import { success } from '../lib/response'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/version', (c) => {
  const version = c.env.APP_VERSION || '2.3.2'
  const configuredCommitHash = c.env.GIT_COMMIT_HASH?.trim()
  const commitHash = configuredCommitHash && configuredCommitHash !== 'unknown'
    ? configuredCommitHash
    : 'dev'
  const buildTime = c.env.VERSION_METADATA?.timestamp || null

  return c.json(
    success({
      version,
      commit_hash: commitHash,
      short_hash: commitHash.length >= 7 ? commitHash.slice(0, 7) : commitHash,
      build_time: buildTime,
    }),
  )
})

export default app
