import { describe, expect, it } from 'vitest'
import { hashPassword, MAX_WORKERS_PBKDF2_ITERATIONS, verifyPassword } from '../src/lib/password'

describe('PBKDF2 administrator password hashes', () => {
  const password = 'a-long-local-test-password'

  it('accepts the iteration count that hash-password produces', async () => {
    const hash = await hashPassword(password)
    expect(await verifyPassword(password, hash)).toBe(true)
    expect(await verifyPassword(`${password}!`, hash)).toBe(false)
  })

  it('rejects counts above the production Workers cap even though local runtimes compute them', async () => {
    // Miniflare derives this happily; production would throw NotSupportedError.
    const hash = await hashPassword(password, MAX_WORKERS_PBKDF2_ITERATIONS + 1)
    expect(await verifyPassword(password, hash)).toBe(false)
  })
})
