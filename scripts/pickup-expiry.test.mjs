import assert from 'node:assert/strict'
import test from 'node:test'
import { pickupDeadline, pickupExpiryReason } from '../frontend/src/utils/pickup-expiry.ts'

const timestamp = seconds => new Date(seconds * 1000).toISOString()
test('short shares expire before a longer legacy download session', () => {
  const share = { expire_at: timestamp(60), download_expires_at: timestamp(3600) }
  assert.equal(pickupDeadline(share), 60_000)
  assert.equal(pickupExpiryReason(share, 59_999), null)
  assert.equal(pickupExpiryReason(share, 60_000), 'share')
})
test('download session expiration is distinguished from share expiration', () => {
  const share = { expire_at: timestamp(7200), download_expires_at: timestamp(3600) }
  assert.equal(pickupDeadline(share), 3_600_000)
  assert.equal(pickupExpiryReason(share, 3_600_000), 'session')
})
test('missing legacy session deadlines still respect share expiration', () => {
  const share = { expire_at: timestamp(60) }
  assert.equal(pickupDeadline(share), 60_000)
  assert.equal(pickupExpiryReason(share, 60_000), 'share')
  assert.equal(pickupDeadline({ expire_at: 'invalid' }), Infinity)
})
