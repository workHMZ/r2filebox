import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { AuditSubject, Env, Share } from '../types'
import { ErrorCode } from '../types/errors'
import { BodyTooLargeError, InvalidBodyError } from './body'
import type { DB } from './db'
import { error } from './response'
import {
  getRuntimeConfig,
  RuntimeConfigUnavailableError,
  type RuntimeConfig,
} from './runtime-config'

export function readSessionCookie(c: Context, name: string): string | null {
  return getCookie(c, name) || null
}

export function setSessionCookie(
  c: Context,
  name: string,
  value: string,
  path: string,
  maxAge: number,
): void {
  setCookie(c, name, value, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Strict',
    path,
    maxAge: Math.max(0, Math.trunc(maxAge)),
  })
}

export function routeFailure(
  c: Context,
  operation: string,
  cause: unknown,
  defaultMessage: string,
) {
  if (cause instanceof BodyTooLargeError) {
    return c.json(error(ErrorCode.PAYLOAD_TOO_LARGE, 413, 'Payload too large'), 413)
  }
  if (cause instanceof InvalidBodyError) {
    return c.json(error(ErrorCode.INVALID_FORMAT, 400, 'Invalid request format'), 400)
  }
  if (cause instanceof RuntimeConfigUnavailableError) {
    console.error(`${operation} failed:`, cause)
    return c.json(
      error(ErrorCode.SERVICE_UNAVAILABLE, 503, 'Service temporarily unavailable, please try again later'),
      503,
    )
  }
  console.error(`${operation} failed:`, cause)
  return c.json(error(ErrorCode.INTERNAL_SERVER_ERROR, 500, defaultMessage), 500)
}

export function shareAuditSubject(share: Share): AuditSubject {
  return {
    type: share.type,
    name: share.display_name,
    sizeBytes: share.size_bytes,
  }
}

export async function writeAuditLog(
  db: DB,
  c: Context,
  action: string,
  shareId: string | null,
  status: string,
  ipHash: string | null,
  options: {
    accessLog?: boolean
    force?: boolean
    config?: RuntimeConfig
    subject?: AuditSubject
  } = {},
): Promise<void> {
  try {
    const config = options.config || await getRuntimeConfig(c.env as Env, db)
    if (!config.enableAuditLog && !options.force) return
    if (options.accessLog && !config.enableAccessLog) return
    await db.createAuditLog({
      id: crypto.randomUUID(),
      action,
      share_id: shareId,
      subject_type: options.subject?.type || null,
      subject_name: options.subject?.name || null,
      size_bytes: options.subject?.sizeBytes ?? null,
      ip_hash: ipHash,
      user_agent_hash: null,
      status,
      created_at: new Date().toISOString(),
    })
  } catch (cause) {
    console.error(`Failed to write audit log (${action}):`, cause)
  }
}
