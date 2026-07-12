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
const KV_PLACEHOLDER = '00000000000000000000000000000000'

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
} finally {
  rl.close()
}

async function main() {
  console.log('R2FileBox Cloudflare deploy helper')
  console.log('This script provisions resources, configures secrets, builds assets, runs migrations, and deploys.')

  run('npm', ['ci'], root)

  let whoami = run('npx', ['wrangler', 'whoami'], root, { allowFailure: true })
  if (whoami.status !== 0) {
    const login = await ask('Wrangler is not logged in. Run `npx wrangler login` now? [Y/n] ', 'Y')
    if (login.toLowerCase() !== 'n') {
      run('npx', ['wrangler', 'login'], root)
      whoami = run('npx', ['wrangler', 'whoami'], root)
    }
  }
  await selectCloudflareAccount(whoami)

  const bucketName = validateBucketName(await ask('R2 bucket name [r2filebox-files]: ', 'r2filebox-files'))
  const dbName = validateResourceName(await ask('D1 database name [r2filebox-db]: ', 'r2filebox-db'), 'D1 database')
  const kvName = validateResourceName(await ask('KV namespace name [r2filebox-rate-limit]: ', 'r2filebox-rate-limit'), 'KV namespace')
  patchWranglerNames(bucketName, dbName)

  run('npx', ['wrangler', 'r2', 'bucket', 'create', bucketName], root, { allowFailure: true })

  let databaseId = readConfiguredDatabaseId()
  if (!databaseId || databaseId === D1_PLACEHOLDER || databaseId === 'REPLACE_WITH_D1_DATABASE_ID') {
    const create = run('npx', ['wrangler', 'd1', 'create', dbName], root, { allowFailure: true })
    databaseId = parseDatabaseId(`${create.stdout}\n${create.stderr}`)
    if (!databaseId) {
      databaseId = await ask('Paste D1 database_id from Cloudflare/Wrangler output: ')
    }
    validateDatabaseId(databaseId)
    patchDatabaseId(databaseId)
  }

  let kvNamespaceId = readConfiguredKvNamespaceId()
  if (!kvNamespaceId || kvNamespaceId === KV_PLACEHOLDER || kvNamespaceId === 'REPLACE_WITH_KV_NAMESPACE_ID') {
    const createKv = run('npx', ['wrangler', 'kv', 'namespace', 'create', kvName], root, { allowFailure: true })
    kvNamespaceId = parseKvNamespaceId(`${createKv.stdout}\n${createKv.stderr}`)
    if (!kvNamespaceId) {
      kvNamespaceId = await ask('Paste KV namespace id from Cloudflare/Wrangler output: ')
    }
    validateKvNamespaceId(kvNamespaceId)
    patchKvNamespaceId(kvNamespaceId)
  }

  const adminUsername = await ask('Admin username [admin]: ', 'admin')
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(adminUsername)) throw new Error('Admin username format is invalid')
  const adminPassword = await askSecret('Admin password to hash and set as ADMIN_PASSWORD_HASH: ')
  if (adminPassword.length < 16 || adminPassword.length > 4096) throw new Error('Admin password must be 16-4096 characters')

  const adminHash = await hashPassword(adminPassword)
  putSecret('ADMIN_USERNAME', adminUsername)
  putSecret('ADMIN_PASSWORD_HASH', adminHash)
  putSecret('CODE_HASH_PEPPER', randomBytes(32).toString('hex'))
  putSecret('SESSION_SECRET', randomBytes(32).toString('hex'))

  const useTurnstile = await ask('Set TURNSTILE_SECRET_KEY now? [y/N] ', 'N')
  if (useTurnstile.toLowerCase() === 'y') {
    const turnstileSecret = await askSecret('TURNSTILE_SECRET_KEY: ')
    if (turnstileSecret) putSecret('TURNSTILE_SECRET_KEY', turnstileSecret)
  }

  run('npm', ['run', 'build'], root)
  run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote'], root)
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
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
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
  }
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

function validateKvNamespaceId(value) {
  if (!/^[a-f0-9]{32}$/i.test(value)) throw new Error('KV namespace ID is invalid')
}

function patchWranglerNames(bucketName, dbName) {
  const toml = readFileSync(wranglerTomlPath, 'utf8')
    .replace(/bucket_name = ".*"/, `bucket_name = "${bucketName}"`)
    .replace(/database_name = ".*"/, `database_name = "${dbName}"`)
  writeFileSync(wranglerTomlPath, toml)
}

function readConfiguredDatabaseId() {
  if (!existsSync(wranglerTomlPath)) return null
  const match = readFileSync(wranglerTomlPath, 'utf8').match(/database_id = "([^"]+)"/)
  return match?.[1] || null
}

function patchDatabaseId(databaseId) {
  const toml = readFileSync(wranglerTomlPath, 'utf8')
    .replace(/database_id = ".*"/, `database_id = "${databaseId}"`)
  writeFileSync(wranglerTomlPath, toml)
}

function readConfiguredKvNamespaceId() {
  if (!existsSync(wranglerTomlPath)) return null
  const match = readFileSync(wranglerTomlPath, 'utf8').match(/binding = "RATE_LIMIT"[\s\S]*?id = "([^"]+)"/)
  return match?.[1] || null
}

function patchKvNamespaceId(namespaceId) {
  const toml = readFileSync(wranglerTomlPath, 'utf8')
    .replace(/(binding = "RATE_LIMIT"[\s\S]*?id = )"[^"]+"/, `$1"${namespaceId}"`)
  writeFileSync(wranglerTomlPath, toml)
}

function parseDatabaseId(outputText) {
  return outputText.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ||
    outputText.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1] ||
    outputText.match(/database_id[^a-f0-9-]*([a-f0-9-]{32,})/i)?.[1] ||
    null
}

function parseKvNamespaceId(outputText) {
  return outputText.match(/id\s*=\s*"([^"]+)"/)?.[1] ||
    outputText.match(/"id"\s*:\s*"([^"]+)"/)?.[1] ||
    outputText.match(/namespace id[^a-f0-9]*([a-f0-9]{32,})/i)?.[1] ||
    null
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
