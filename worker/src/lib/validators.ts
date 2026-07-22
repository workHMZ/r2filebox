export const sanitizeFilename = (filename: string): string => {
  let safe = filename.replace(/^.*[\\\/]/, '')
  safe = safe
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
    .trim()
  if (!safe || safe === '.' || safe === '..') return 'unnamed_file'
  return [...safe].slice(0, 200).join('')
}

export const sanitizeMimeType = (mimeType: string): string => {
  const value = mimeType.trim().slice(0, 128)
  return /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/.test(value)
    ? value
    : 'application/octet-stream'
}

export const calculateExpireAt = (
  expireValue?: number,
  expireStyle?: string,
  defaultHours: number = 24,
  maxHours: number = 168
): string => {
  let hoursToAdd = defaultHours

  if (expireValue !== undefined && expireStyle !== undefined) {
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
      default:
        hoursToAdd = defaultHours
    }
  }

  if (!Number.isFinite(hoursToAdd) || hoursToAdd <= 0) hoursToAdd = defaultHours
  hoursToAdd = Math.min(hoursToAdd, Math.max(maxHours, 1))

  const expireDate = new Date()
  // hoursToAdd can be fractional (e.g. for minutes)
  expireDate.setTime(expireDate.getTime() + hoursToAdd * 60 * 60 * 1000)
  
  return expireDate.toISOString()
}

export const contentDispositionAttachment = (filename: string): string => {
  const safe = sanitizeFilename(filename).replace(/"/g, '')
  return `attachment; filename*=UTF-8''${encodeURIComponent(safe)}`
}
