#!/usr/bin/env node

import { webcrypto } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { Writable } from 'node:stream'

const password = process.argv[2] || await readPassword()
if (password.length < 16 || password.length > 4096) {
  console.error('Password must contain 16-4096 characters.')
  process.exit(1)
}

const iterations = 100000
const hashBytes = 32
const saltBytes = 16
const salt = webcrypto.getRandomValues(new Uint8Array(saltBytes))
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

const saltBase64 = Buffer.from(salt).toString('base64')
const hashBase64 = Buffer.from(hashBuffer).toString('base64')
console.log(`pbkdf2$${iterations}$${saltBase64}$${hashBase64}`)

async function readPassword() {
  if (!stdin.isTTY) {
    console.error('Run this command in an interactive terminal or pass the password as an argument.')
    return ''
  }

  const mutedOutput = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })
  const rl = createInterface({ input: stdin, output: mutedOutput, terminal: true })
  stdout.write('Admin password: ')
  try {
    return (await rl.question('')).trim()
  } finally {
    rl.close()
    stdout.write('\n')
  }
}
