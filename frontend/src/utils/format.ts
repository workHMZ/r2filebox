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

export const formatDateTime = (value: string | null | undefined, locale?: string): string => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(locale)
}
