export const sanitizeFilename = (filename: string): string => {
  // Remove path traversal attempts
  let safe = filename.replace(/^.*[\\\/]/, '')
  // Remove non-printable characters
  safe = safe.replace(/[\x00-\x1F\x7F]/g, '')
  
  // If filename becomes empty after sanitization, use a default
  return safe || 'unnamed_file'
}

export const calculateExpireAt = (
  expireValue?: number,
  expireStyle?: string,
  expireHours?: number,
  defaultHours: number = 24,
  maxHours: number = 168
): string => {
  let hoursToAdd = 0

  if (expireHours !== undefined) {
    // New API format
    hoursToAdd = expireHours
  } else if (expireValue !== undefined && expireStyle !== undefined) {
    // Old frontend format compatibility
    switch (expireStyle) {
      case 'minute':
        hoursToAdd = expireValue / 60
        break
      case 'hour':
        hoursToAdd = expireValue
        break
      case 'day':
        hoursToAdd = expireValue * 24
        break
      case 'week':
        hoursToAdd = expireValue * 24 * 7
        break
      case 'month':
        hoursToAdd = expireValue * 24 * 30
        break
      case 'year':
        hoursToAdd = expireValue * 24 * 365
        break
      case 'forever':
        hoursToAdd = maxHours
        break
      default:
        hoursToAdd = defaultHours
    }
  } else {
    hoursToAdd = defaultHours
  }

  // Cap at max limit (unless it's 'forever' which returned null above)
  if (hoursToAdd > maxHours) {
    hoursToAdd = maxHours
  }

  const expireDate = new Date()
  // hoursToAdd can be fractional (e.g. for minutes)
  expireDate.setTime(expireDate.getTime() + hoursToAdd * 60 * 60 * 1000)
  
  return expireDate.toISOString()
}

export const contentDispositionAttachment = (filename: string): string => {
  const safe = sanitizeFilename(filename).replace(/"/g, '')
  return `attachment; filename*=UTF-8''${encodeURIComponent(safe)}`
}
