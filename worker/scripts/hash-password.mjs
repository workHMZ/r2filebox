#!/usr/bin/env node

import { webcrypto } from 'node:crypto'

const password = process.argv[2]
if (!password) {
  console.error('Usage: npm run hash-password -- <password>')
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
