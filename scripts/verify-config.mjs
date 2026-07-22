#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const frontendPackageJson = JSON.parse(readFileSync(resolve(root, 'frontend/package.json'), 'utf8'))
const wrangler = readFileSync(resolve(root, 'wrangler.toml'), 'utf8')
const generatedBindings = readFileSync(resolve(root, 'worker/worker-configuration.d.ts'), 'utf8')
const failures = []

const expectMatch = (pattern, message) => {
  if (!pattern.test(wrangler)) failures.push(message)
}

const appVersion = wrangler.match(/^APP_VERSION = "([^"]+)"$/m)?.[1]
const packageVersion = String(packageJson.version).replace(/\.0$/, '')
if (appVersion !== packageVersion) {
  failures.push(`APP_VERSION (${appVersion || 'missing'}) must match package version (${packageJson.version})`)
}
if (frontendPackageJson.version !== packageJson.version) {
  failures.push(`Frontend package version (${frontendPackageJson.version}) must match root package version (${packageJson.version})`)
}

expectMatch(/^compatibility_date = "2026-07-20"$/m, 'compatibility_date must be 2026-07-20')
if (/\[\[kv_namespaces\]\]/.test(wrangler) || /binding = "RATE_LIMIT"/.test(wrangler)) {
  failures.push('The obsolete KV rate-limit binding must not be configured')
}
if (/^ENABLE_KV_RATE_LIMIT\s*=/m.test(wrangler)) {
  failures.push('The obsolete ENABLE_KV_RATE_LIMIT variable must not be configured')
}

const expectedRateLimits = new Map([
  ['UPLOAD_RATE_LIMITER', 600],
  ['UPLOAD_PART_RATE_LIMITER', 2000],
  ['RESOLVE_RATE_LIMITER', 2000],
  ['DOWNLOAD_RATE_LIMITER', 2000],
])
const blocks = [...wrangler.matchAll(/\[\[ratelimits\]\]([\s\S]*?)(?=\n\[\[|\n\[[^[]|$)/g)]
const namespaceIds = new Set()
for (const [, block] of blocks) {
  const name = block.match(/\bname = "([^"]+)"/)?.[1]
  const namespaceId = block.match(/\bnamespace_id = "([0-9]+)"/)?.[1]
  const simple = block.match(/\bsimple = \{ limit = ([0-9]+), period = ([0-9]+) \}/)
  if (!name || !expectedRateLimits.has(name)) continue
  if (!namespaceId || namespaceIds.has(namespaceId)) failures.push(`${name} must have a unique numeric namespace_id`)
  if (namespaceId) namespaceIds.add(namespaceId)
  if (Number(simple?.[1]) !== expectedRateLimits.get(name) || Number(simple?.[2]) !== 60) {
    failures.push(`${name} must use the documented fixed 60-second coarse limit`)
  }
  expectedRateLimits.delete(name)
}
for (const name of expectedRateLimits.keys()) failures.push(`Missing native rate-limit binding: ${name}`)

for (const binding of ['UPLOAD_RATE_LIMITER', 'UPLOAD_PART_RATE_LIMITER', 'RESOLVE_RATE_LIMITER', 'DOWNLOAD_RATE_LIMITER']) {
  if (!generatedBindings.includes(`\t${binding}: RateLimit;`)) failures.push(`Generated bindings are stale: ${binding} is missing`)
}

if (process.env.REQUIRE_PLACEHOLDER_BINDINGS === '1') {
  expectMatch(
    /^database_id = "00000000-0000-0000-0000-000000000000"$/m,
    'The public repository must retain the placeholder D1 database_id',
  )
}

if (failures.length) {
  console.error('Configuration verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exitCode = 1
} else {
  console.log('Configuration verification passed.')
}
