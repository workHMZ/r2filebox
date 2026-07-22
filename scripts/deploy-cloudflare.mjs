#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes, webcrypto } from 'node:crypto'
import { Writable } from 'node:stream'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wranglerTomlPath = resolve(root, 'wrangler.toml')

const D1_PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

let promptMuted = false
const promptOutput = new Writable({
  write(chunk, _encoding, callback) {
    if (!promptMuted) output.write(chunk)
    callback()
  },
})
const rl = createInterface({ input, output: promptOutput, terminal: Boolean(input.isTTY) })

try {
  await main()
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause)
  console.error(`\nDeployment failed: ${message}`)
  if (process.env.R2FILEBOX_DEBUG === '1' && cause instanceof Error) console.error(cause.stack)
  process.exitCode = 1
} finally {
  rl.close()
}

async function main() {
  const forceReinitialize = process.argv.slice(2).includes('--force-reinitialize')
  console.log('R2FileBox Cloudflare deploy helper')
  console.log('This script provisions resources, configures secrets, builds assets, runs migrations, and deploys.')

  run('npm', ['ci'], root)

  let whoami = run('npx', ['wrangler', 'whoami'], root, { allowFailure: true })
  if (whoami.status !== 0) {
    const login = await ask('Wrangler is not logged in. Run `npx wrangler login` now? [Y/n] ', 'Y')
    if (login.toLowerCase() === 'n') {
      throw new Error('Deployment stopped: Wrangler authentication is required')
    }
    run('npx', ['wrangler', 'login'], root)
    whoami = run('npx', ['wrangler', 'whoami'], root)
  }
  await selectCloudflareAccount(whoami)

  const configuredDatabaseId = readConfiguredDatabaseId()
  const existingDeployment = Boolean(configuredDatabaseId && !isPlaceholderDatabaseId(configuredDatabaseId))
  if (existingDeployment) {
    if (forceReinitialize) {
      throw new Error('Refusing --force-reinitialize because wrangler.toml already contains a real D1 binding; manage secrets explicitly with `wrangler secret put` instead')
    }
    validateDatabaseId(configuredDatabaseId)
    console.log('\nAn existing D1 binding is configured. To prevent accidental lockout or data loss,')
    console.log('this helper will reuse the configured resources and will not create or rotate any secrets.')
    const proceed = await ask('Continue with build, migrations, and deployment only? [y/N] ', 'N')
    if (proceed.toLowerCase() !== 'y') {
      throw new Error('Deployment stopped without changing resources or secrets')
    }

    run('npm', ['run', 'build'], root)
    run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote'], root)
    run('npx', ['wrangler', 'deploy'], root)
    console.log('Deploy complete. Existing secrets were not changed.')
    return
  }

  const bucketName = validateBucketName(await ask('R2 bucket name [r2filebox-files]: ', 'r2filebox-files'))
  const dbName = validateResourceName(await ask('D1 database name [r2filebox-db]: ', 'r2filebox-db'), 'D1 database')
  patchWranglerNames(bucketName, dbName)

  let reusedExistingBucket = false
  const bucketInfo = run('npx', ['wrangler', 'r2', 'bucket', 'info', bucketName, '--json'], root, {
    allowFailure: true,
  })
  if (bucketInfo.status === 0) {
    const reuseBucket = await ask(`R2 bucket "${bucketName}" already exists. Reuse it? [y/N] `, 'N')
    if (reuseBucket.toLowerCase() !== 'y') {
      throw new Error('Deployment stopped: choose a new R2 bucket name or explicitly reuse the existing bucket')
    }
    reusedExistingBucket = true
  } else {
    run('npx', ['wrangler', 'r2', 'bucket', 'create', bucketName], root, {
      failureHint: `Could not create R2 bucket "${bucketName}". Verify the selected account, bucket name, and R2 permissions.`,
    })
  }

  let reusedExistingDatabase = false
  let databaseId = findDatabaseByName(dbName)
  if (databaseId) {
    const reuseDatabase = await ask(`D1 database "${dbName}" already exists. Reuse it? [y/N] `, 'N')
    if (reuseDatabase.toLowerCase() !== 'y') {
      throw new Error('Deployment stopped: choose a new D1 database name or explicitly reuse the existing database')
    }
    reusedExistingDatabase = true
  } else {
    const create = run('npx', ['wrangler', 'd1', 'create', dbName], root, {
      failureHint: `Could not create D1 database "${dbName}". Verify the selected account, database name, and D1 permissions.`,
    })
    databaseId = parseDatabaseId(`${create.stdout}\n${create.stderr}`)
    if (!databaseId) {
      throw new Error('D1 was created, but Wrangler did not return a database_id. Run `wrangler d1 list --json`, then update wrangler.toml before retrying.')
    }
  }
  validateDatabaseId(databaseId)
  patchDatabaseId(databaseId)

  const reusedExistingResource = reusedExistingBucket || reusedExistingDatabase
  let initializeSecrets = true
  if (reusedExistingResource) {
    console.log('\nAt least one existing Cloudflare resource will be reused.')
    console.log('The safe default is to preserve all current Worker secrets.')
    if (forceReinitialize) {
      console.log('WARNING: reinitializing secrets invalidates existing extraction codes and sessions for this Worker.')
      const confirmation = await ask('Type REINITIALIZE to confirm this is an empty/new instance: ')
      if (confirmation !== 'REINITIALIZE') {
        throw new Error('Reinitialization confirmation did not match; no secrets were changed')
      }
    } else {
      initializeSecrets = false
      const proceed = await ask('Continue with build, migrations, and deployment without changing secrets? [y/N] ', 'N')
      if (proceed.toLowerCase() !== 'y') {
        throw new Error('Deployment stopped without changing secrets; use --force-reinitialize only for intentionally empty resources')
      }
    }
  }

  run('npm', ['run', 'build'], root)
  run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote'], root)

  if (!initializeSecrets) {
    run('npx', ['wrangler', 'deploy'], root)
    console.log('Deploy complete. Existing secrets were not changed.')
    return
  }

  const adminUsername = await ask('Admin username [admin]: ', 'admin')
  if (!adminUsername || adminUsername.length > 256 || /[\x00-\x1f\x7f]/.test(adminUsername)) {
    throw new Error('Admin username format is invalid')
  }
  const suppliedAdminPassword = await askSecret('Admin password (leave blank to generate a random initial password): ')
  const adminPassword = suppliedAdminPassword || randomBytes(24).toString('base64url')
  if (adminPassword.length < 16 || adminPassword.length > 4096) throw new Error('Admin password must be 16-4096 characters')
  if (!suppliedAdminPassword) {
    console.log(`Generated admin password (save it now; it will only be shown once): ${adminPassword}`)
  }

  const adminHash = await hashPassword(adminPassword)
  const secrets = [
    ['ADMIN_USERNAME', adminUsername],
    ['ADMIN_PASSWORD_HASH', adminHash],
    ['CODE_HASH_PEPPER', randomBytes(32).toString('hex')],
    ['SESSION_SECRET', randomBytes(32).toString('hex')],
  ]

  const useTurnstile = await ask('Set TURNSTILE_SECRET_KEY now? [y/N] ', 'N')
  if (useTurnstile.toLowerCase() === 'y') {
    const turnstileSecret = await askSecret('TURNSTILE_SECRET_KEY: ')
    if (turnstileSecret) secrets.push(['TURNSTILE_SECRET_KEY', turnstileSecret])
  }

  console.log('\nBuild and database migration succeeded. Writing first-deployment secrets now.')
  for (const [name, value] of secrets) putSecret(name, value)
  run('npx', ['wrangler', 'deploy'], root)

  console.log('Deploy complete.')
}

function run(command, args, cwd, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.input ? ['pipe', 'pipe', 'pipe'] : ['inherit', 'pipe', 'pipe'],
    input: options.input,
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.failureHint || `Command failed: ${command} ${args.join(' ')}`
    throw new Error(`${detail} (exit status ${result.status ?? 'unknown'})`)
  }
  return result
}

async function ask(question, fallback = '') {
  const answer = await rl.question(question)
  return answer.trim() || fallback
}

async function askSecret(question) {
  output.write(question)
  promptMuted = Boolean(input.isTTY)
  try {
    return (await rl.question('')).trim()
  } finally {
    promptMuted = false
    if (input.isTTY) output.write('\n')
  }
}

async function selectCloudflareAccount(whoami) {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return
  const ids = [...new Set(`${whoami.stdout}\n${whoami.stderr}`.match(/\b[a-f0-9]{32}\b/gi) || [])]
  if (ids.length === 1) {
    process.env.CLOUDFLARE_ACCOUNT_ID = ids[0]
    return
  }
  if (ids.length > 1) {
    console.log('Multiple Cloudflare accounts are available:')
    ids.forEach((id, index) => console.log(`  ${index + 1}. ${id}`))
    const selected = await ask('Select account number or paste account ID: ')
    const index = Number.parseInt(selected, 10)
    const accountId = Number.isInteger(index) && index >= 1 && index <= ids.length
      ? ids[index - 1]
      : selected
    if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('Cloudflare account ID is invalid')
    process.env.CLOUDFLARE_ACCOUNT_ID = accountId
    return
  }
  throw new Error('Could not determine the Cloudflare account ID from `wrangler whoami`; set CLOUDFLARE_ACCOUNT_ID and retry')
}

function validateBucketName(value) {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(value)) {
    throw new Error('R2 bucket name must be 3-63 lowercase letters, numbers, or hyphens')
  }
  return value
}

function validateResourceName(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new Error(`${label} name contains unsupported characters`)
  }
  return value
}

function validateDatabaseId(value) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) {
    throw new Error('D1 database ID is invalid')
  }
}

function patchWranglerNames(bucketName, dbName) {
  let toml = readFileSync(wranglerTomlPath, 'utf8')
  toml = replaceExactlyOnce(toml, /bucket_name = ".*"/, `bucket_name = "${bucketName}"`, 'R2 bucket binding')
  toml = replaceExactlyOnce(toml, /database_name = ".*"/, `database_name = "${dbName}"`, 'D1 database binding')
  toml = replaceExactlyOnce(toml, /^R2_BUCKET_NAME = ".*"$/m, `R2_BUCKET_NAME = "${bucketName}"`, 'R2_BUCKET_NAME variable')
  toml = replaceExactlyOnce(toml, /^D1_DATABASE_NAME = ".*"$/m, `D1_DATABASE_NAME = "${dbName}"`, 'D1_DATABASE_NAME variable')
  writeFileSync(wranglerTomlPath, toml)
}

function readConfiguredDatabaseId() {
  if (!existsSync(wranglerTomlPath)) return null
  const match = readFileSync(wranglerTomlPath, 'utf8').match(/database_id = "([^"]+)"/)
  return match?.[1] || null
}

function patchDatabaseId(databaseId) {
  const toml = replaceExactlyOnce(
    readFileSync(wranglerTomlPath, 'utf8'),
    /database_id = ".*"/,
    `database_id = "${databaseId}"`,
    'D1 database_id',
  )
  writeFileSync(wranglerTomlPath, toml)
}

function replaceExactlyOnce(text, pattern, replacement, label) {
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
  const matches = text.match(globalPattern) || []
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} in wrangler.toml, found ${matches.length}; no ambiguous edit was written`)
  }
  return text.replace(pattern, replacement)
}

function parseDatabaseId(outputText) {
  return outputText.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ||
    outputText.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1] ||
    outputText.match(/database_id[^a-f0-9-]*([a-f0-9-]{32,})/i)?.[1] ||
    null
}

function isPlaceholderDatabaseId(value) {
  return value === D1_PLACEHOLDER || value === 'REPLACE_WITH_D1_DATABASE_ID'
}

function findDatabaseByName(databaseName) {
  const listed = run('npx', ['wrangler', 'd1', 'list', '--json'], root, {
    failureHint: 'Could not inspect existing D1 databases. Verify the selected account and D1 permissions.',
  })
  let databases
  try {
    databases = JSON.parse(listed.stdout)
  } catch {
    throw new Error('Wrangler returned invalid JSON for `d1 list`; no resources or secrets were changed after this point')
  }
  if (!Array.isArray(databases)) throw new Error('Wrangler returned an unexpected D1 database list')
  const match = databases.find((database) => database?.name === databaseName)
  return match?.uuid || match?.id || null
}

function putSecret(name, value) {
  run('npx', ['wrangler', 'secret', 'put', name], root, { input: value })
}

async function hashPassword(password) {
  const iterations = 100000
  const hashBytes = 32
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const encoder = new TextEncoder()
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const hashBuffer = await webcrypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    hashBytes * 8,
  )
  return `pbkdf2$${iterations}$${Buffer.from(salt).toString('base64')}$${Buffer.from(hashBuffer).toString('base64')}`
}
