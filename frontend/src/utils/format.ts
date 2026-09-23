const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export const formatFileSize = (
  bytes: number | null | undefined,
  locale?: string,
  invalidValue = '-',
): string => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return invalidValue
  if (bytes === 0) return '0 B'
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZE_UNITS.length - 1)
  const value = bytes / 1024 ** unitIndex
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} ${SIZE_UNITS[unitIndex]}`
}

export interface DateTimeParts {
  date: string
  time: string
  full: string
}

export const formatSplitDateTime = (value: string | number | Date | null | undefined): DateTimeParts => {
  if (!value) return { date: '-', time: '', full: '-' }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return { date: '-', time: '', full: '-' }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  const dateStr = `${year}-${month}-${day}`
  const timeStr = `${hours}:${minutes}:${seconds}`
  return {
    date: dateStr,
    time: timeStr,
    full: `${dateStr} ${timeStr}`
  }
}

export const formatClockTime = (value: Date | string | number = new Date()): string => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

export const formatDateTime = (value: string | null | undefined, _locale?: string): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const parts = formatSplitDateTime(date)
  return parts.full
}
