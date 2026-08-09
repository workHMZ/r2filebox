#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDeployVarsArgs } from './deploy-metadata.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.slice(2).includes('--dry-run')

if (!dryRun) run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote'])
run('npx', ['wrangler', 'deploy', ...getDeployVarsArgs(root), ...(dryRun ? ['--dry-run'] : [])])

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
