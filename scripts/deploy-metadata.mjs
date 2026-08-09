import { spawnSync } from 'node:child_process'

export function getDeployVarsArgs(root, options = {}) {
  const commitHash = options.commitHash ?? readCommitHash(root)
  const buildTime = options.buildTime ?? new Date().toISOString()

  return [
    '--var',
    `GIT_COMMIT_HASH:${normalizeCommitHash(commitHash)}`,
    '--var',
    `BUILD_TIMESTAMP:${normalizeBuildTime(buildTime)}`,
  ]
}

function readCommitHash(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

function normalizeCommitHash(value) {
  const normalized = String(value).trim()
  return /^[a-f0-9]{7,64}$/i.test(normalized) ? normalized : 'unknown'
}

function normalizeBuildTime(value) {
  const normalized = String(value).trim()
  return Number.isNaN(Date.parse(normalized)) ? '' : normalized
}
