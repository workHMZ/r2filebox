export type ExpireStyle = 'minute' | 'hour' | 'day' | 'week'

const HOURS_PER_UNIT: Record<ExpireStyle, number> = {
  minute: 1 / 60,
  hour: 1,
  day: 24,
  week: 168,
}

export const expireSelectionFromHours = (hours: number): { value: number; style: ExpireStyle } => {
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 24
  for (const style of ['week', 'day', 'hour'] as const) {
    const value = safeHours / HOURS_PER_UNIT[style]
    if (Number.isInteger(value)) return { value, style }
  }
  return { value: Math.max(1, Math.round(safeHours * 60)), style: 'minute' }
}

export const maxExpireValue = (maxHours: number, style: ExpireStyle): number => {
  const safeHours = Number.isFinite(maxHours) && maxHours > 0 ? maxHours : 168
  return Math.max(0, Math.floor(safeHours / HOURS_PER_UNIT[style]))
}
