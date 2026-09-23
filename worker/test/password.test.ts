import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { MAX_WORKERS_PBKDF2_ITERATIONS, verifyPassword } from '../src/lib/password'

async function hashWith(password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return `pbkdf2$${iterations}$${Buffer.from(salt).toString('base64')}$${Buffer.from(bits).toString('base64')}`
}

describe('PBKDF2 administrator password hashes', () => {
  const password = 'a-long-local-test-password'

  it('accepts the iteration count that hash-password produces', async () => {
    const hash = await hashWith(password, MAX_WORKERS_PBKDF2_ITERATIONS)
    expect(await verifyPassword(password, hash)).toBe(true)
    expect(await verifyPassword(`${password}!`, hash)).toBe(false)
  })

  it('rejects counts above the production Workers cap even though local runtimes compute them', async () => {
    // Miniflare derives this happily; production would throw NotSupportedError.
    const hash = await hashWith(password, MAX_WORKERS_PBKDF2_ITERATIONS + 1)
    expect(await verifyPassword(password, hash)).toBe(false)
  })
})
