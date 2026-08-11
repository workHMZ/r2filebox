import type { Env } from '../types'

export function boolEnv(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback
  return value.toLowerCase() === 'true' || value === '1'
}

export function intEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getRequiredSecret(env: Env, key: keyof Env): string {
  const value = env[key]
  if (typeof value !== 'string' || value.length < 16) {
    throw new Error(`${String(key)} is not configured`)
  }
  return value
}
