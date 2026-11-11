import { Buffer } from 'node:buffer'
import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto'

const ITERATIONS = 100000
// Production Workers reject PBKDF2 above 100,000 iterations with
// NotSupportedError, while wrangler dev, Miniflare and Node accept any count.
// A stronger-looking hash would therefore pass every local check and then turn
// each production login into a silent "invalid credentials".
export const MAX_WORKERS_PBKDF2_ITERATIONS = 100000
const HASH_BYTES = 32
const SALT_BYTES = 16

/**
 * Derive a Workers-compatible PBKDF2-SHA256 administrator password hash.
 */
export async function hashPassword(
  password: string,
  iterations = MAX_WORKERS_PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_BYTES * 8,
  )
  const saltBase64 = Buffer.from(salt).toString('base64')
  const hashBase64 = Buffer.from(hashBuffer).toString('base64')
  return `pbkdf2$${iterations}$${saltBase64}$${hashBase64}`
}

/**
 * Verify a password against a hash.
 */
export async function verifyPassword(password: string, hashString: string): Promise<boolean> {
  try {
    if (!hashString.startsWith('pbkdf2$') || password.length > 4096) return false

    const parts = hashString.split('$')
    if (parts.length !== 4) return false

    const iterations = Number.parseInt(parts[1], 10)
    if (!Number.isInteger(iterations) || iterations < ITERATIONS) return false
    if (iterations > MAX_WORKERS_PBKDF2_ITERATIONS) {
      console.error(
        `ADMIN_PASSWORD_HASH uses ${iterations} PBKDF2 iterations; Cloudflare Workers support at most ` +
        `${MAX_WORKERS_PBKDF2_ITERATIONS}. Regenerate it with \`npm run hash-password\`.`,
      )
      return false
    }

    const salt = decodeBase64(parts[2])
    const stored = decodeBase64(parts[3])
    if (salt.byteLength !== SALT_BYTES || stored.byteLength !== HASH_BYTES) return false

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    )

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      HASH_BYTES * 8,
    )

    return timingSafeEqual(new Uint8Array(hashBuffer), stored)
  } catch {
    return false
  }
}

export async function verifyPlainPassword(password: string, expectedPassword: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(password)),
    crypto.subtle.digest('SHA-256', encoder.encode(expectedPassword)),
  ])
  return timingSafeEqual(new Uint8Array(actualHash), new Uint8Array(expectedHash))
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  return cryptoTimingSafeEqual(a, b)
}

function decodeBase64(value: string): Uint8Array {
  return Buffer.from(value, 'base64')
}
