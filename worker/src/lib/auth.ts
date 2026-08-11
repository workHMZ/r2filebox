import { Buffer } from 'node:buffer'

// A lightweight JWT implementation using Web Crypto for signing and the
// Workers-native Buffer API for binary-to-text encoding.

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return Buffer.from(bytes).toString('base64url')
}

function base64UrlDecode(str: string): Uint8Array {
  return Buffer.from(str, 'base64url')
}

export async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encoder = new TextEncoder()
  
  const encodedHeader = base64UrlEncode(encoder.encode(JSON.stringify(header)))
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const dataToSign = `${encodedHeader}.${encodedPayload}`

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(dataToSign)
  )

  const encodedSignature = base64UrlEncode(signature)
  return `${dataToSign}.${encodedSignature}`
}

export async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    if (!token || token.length > 4096) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [encodedHeader, encodedPayload, encodedSignature] = parts
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader)))
    if (!header || header.alg !== 'HS256' || header.typ !== 'JWT') return null

    const dataToVerify = `${encodedHeader}.${encodedPayload}`
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(encodedSignature),
      new TextEncoder().encode(dataToVerify),
    )
    if (!isValid) return null

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)))
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    const record = payload as Record<string, unknown>
    const exp = record.exp
    if (typeof exp !== 'number' || !Number.isFinite(exp) || Date.now() >= exp * 1000) return null
    return record
  } catch {
    return null
  }
}
