const ITERATIONS = 100000
const HASH_BYTES = 32
const SALT_BYTES = 16

/**
 * Hash a password using PBKDF2-HMAC-SHA256
 * Format: pbkdf2$iterations$saltBase64$hashBase64
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES)
  crypto.getRandomValues(salt)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_BYTES * 8
  )

  const saltBase64 = btoa(String.fromCharCode(...salt))
  const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))

  return `pbkdf2$${ITERATIONS}$${saltBase64}$${hashBase64}`
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hashString: string): Promise<boolean> {
  try {
    if (!hashString.startsWith('pbkdf2$') || password.length > 4096) return false

    const parts = hashString.split('$')
    if (parts.length !== 4) return false

    const iterations = Number.parseInt(parts[1], 10)
    if (!Number.isInteger(iterations) || iterations < ITERATIONS || iterations > 1_000_000) return false

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
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

function decodeBase64(value: string): Uint8Array {
  const decoded = atob(value)
  const bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i)
  }
  return bytes
}
