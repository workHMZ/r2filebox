import assert from 'node:assert/strict'
import test from 'node:test'
import { pickupDeadline, pickupExpiryReason } from '../frontend/src/utils/pickup-expiry.ts'
import { formatFileSize, formatSplitDateTime } from '../frontend/src/utils/format.ts'

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
test('formatSplitDateTime follows runtime timezone changes for repeated and new ISO strings', () => {
  const originalTimezone = process.env.TZ
  const iso = '2026-10-17T18:30:00.000Z'
  const equivalentIso = '2026-10-17T18:30:00Z'
  const utcParts = { date: '2026-10-17', time: '18:30:00', full: '2026-10-17 18:30:00' }
  const tokyoParts = { date: '2026-10-18', time: '03:30:00', full: '2026-10-18 03:30:00' }
  try {
    process.env.TZ = 'UTC'
    assert.deepEqual(formatSplitDateTime(iso), utcParts)

    process.env.TZ = 'Asia/Tokyo'
    assert.deepEqual(formatSplitDateTime(iso), tokyoParts)
    assert.deepEqual(formatSplitDateTime(equivalentIso), tokyoParts)

    process.env.TZ = 'UTC'
    assert.deepEqual(formatSplitDateTime(iso), utcParts)
    assert.deepEqual(formatSplitDateTime(equivalentIso), utcParts)
    assert.deepEqual(formatSplitDateTime('not-a-date'), { date: '-', time: '', full: '-' })
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimezone
  }
})
test('formatFileSize formats byte units consistently across locales', () => {
  assert.equal(formatFileSize(0, 'en-US'), '0 B')
  assert.equal(formatFileSize(1536, 'en-US'), '1.5 KB')
  assert.equal(formatFileSize(null, 'en-US'), '-')
})
