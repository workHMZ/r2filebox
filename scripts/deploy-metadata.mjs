import { spawnSync } from 'node:child_process'

export function getDeployVarsArgs(root, options = {}) {
  const commitHash = options.commitHash ?? process.env.WORKERS_CI_COMMIT_SHA ?? readCommitHash(root)

  return [
    '--var',
    `GIT_COMMIT_HASH:${normalizeCommitHash(commitHash)}`,
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
