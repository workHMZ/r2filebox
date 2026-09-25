interface PickupExpiry {
  expire_at: string
  download_expires_at?: string
}

export function pickupExpiryReason(share: PickupExpiry, now = Date.now()): 'share' | 'session' | null {
  if (Date.parse(share.expire_at) <= now) return 'share'
  if (share.download_expires_at && Date.parse(share.download_expires_at) <= now) return 'session'
  return null
}

export function pickupDeadline(share: PickupExpiry): number {
  const deadlines = [share.expire_at, share.download_expires_at]
    .map((value) => Date.parse(value || ''))
    .filter(Number.isFinite)
  return Math.min(...deadlines)
}
