import { createScheduledController, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker, { requireSuccessfulCleanup } from '../src/index'
import type { Env } from '../src/types'

describe('scheduled cleanup reporting', () => {
  it('throws when cleanup reports partial failures', () => {
    expect(() => requireSuccessfulCleanup({ failures: 2 })).toThrow(
      'Scheduled cleanup completed with 2 failed operation(s)',
    )
    expect(() => requireSuccessfulCleanup({ failures: 0 })).not.toThrow()
  })

  it('propagates an unexpected cleanup rejection to the scheduler', async () => {
    const failingEnv = {
      CLEANUP_BATCH_SIZE: '100',
      BUCKET: env.BUCKET,
      DB: {
        prepare() {
          throw new Error('D1 unavailable')
        },
      },
    } as unknown as Env

    await expect(worker.scheduled(createScheduledController(), failingEnv)).rejects.toThrow('D1 unavailable')
  })
})
