import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getDeployVarsArgs } from './deploy-metadata.mjs'

test('builds deterministic Wrangler vars', () => {
  assert.deepEqual(
    getDeployVarsArgs('.', {
      commitHash: 'abcdef1234567890',
      buildTime: '2026-08-08T01:02:03.000Z',
    }),
    [
      '--var',
      'GIT_COMMIT_HASH:abcdef1234567890',
      '--var',
      'BUILD_TIMESTAMP:2026-08-08T01:02:03.000Z',
    ],
  )
})

test('uses safe placeholders for invalid metadata', () => {
  assert.deepEqual(
    getDeployVarsArgs('.', { commitHash: 'not a commit', buildTime: 'not a date' }),
    ['--var', 'GIT_COMMIT_HASH:unknown', '--var', 'BUILD_TIMESTAMP:'],
  )
})

test('initializes deploy metadata before either Cloudflare provisioning path', () => {
  const source = readFileSync(new URL('./deploy-cloudflare.mjs', import.meta.url), 'utf8')
  const declaration = source.indexOf('const deployVars = () => getDeployVarsArgs(root)')
  const deploymentBranch = source.indexOf('const existingDeployment =')

  assert.ok(declaration > 0)
  assert.ok(declaration < deploymentBranch)
  assert.equal(source.match(/\.\.\.deployVars\(\)/g)?.length, 3)
})
