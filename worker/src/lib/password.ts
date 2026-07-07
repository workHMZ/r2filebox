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
  if (!hashString.startsWith('pbkdf2$')) {
    return false
  }

  const parts = hashString.split('$')
  if (parts.length !== 4) return false

  const iterations = parseInt(parts[1], 10)
  const saltBase64 = parts[2]
  const storedHashBase64 = parts[3]

  const saltStr = atob(saltBase64)
  const salt = new Uint8Array(saltStr.length)
  for (let i = 0; i < saltStr.length; i++) {
    salt[i] = saltStr.charCodeAt(i)
  }

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
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_BYTES * 8
  )

  const computed = new Uint8Array(hashBuffer)
  const storedStr = atob(storedHashBase64)
  const stored = new Uint8Array(storedStr.length)
  for (let i = 0; i < storedStr.length; i++) {
    stored[i] = storedStr.charCodeAt(i)
  }

  return timingSafeEqual(computed, stored)
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
