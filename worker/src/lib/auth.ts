import { Buffer } from 'node:buffer'

// A lightweight JWT implementation using Web Crypto for signing and the
// Workers-native Buffer API for binary-to-text encoding.

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const ENCODED_HS256_HEADER = base64UrlEncode(
  textEncoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
)
const MAX_CACHED_HMAC_KEYS = 8
const hmacKeyCache = new Map<string, Promise<CryptoKey>>()

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return Buffer.from(bytes).toString('base64url')
}

function base64UrlDecode(str: string): Uint8Array {
  return Buffer.from(str, 'base64url')
}

function getHmacKey(secret: string): Promise<CryptoKey> {
  const cached = hmacKeyCache.get(secret)
  if (cached) return cached

  const imported = crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  ).catch((cause) => {
    hmacKeyCache.delete(secret)
    throw cause
  })

  if (hmacKeyCache.size >= MAX_CACHED_HMAC_KEYS) {
    const oldestKey = hmacKeyCache.keys().next().value
    if (oldestKey !== undefined) hmacKeyCache.delete(oldestKey)
  }
  hmacKeyCache.set(secret, imported)
  return imported
}

function isSupportedJwtHeader(encodedHeader: string): boolean {
  if (encodedHeader === ENCODED_HS256_HEADER) return true
  const header = JSON.parse(textDecoder.decode(base64UrlDecode(encodedHeader)))
  return Boolean(header && header.alg === 'HS256' && header.typ === 'JWT')
}

export async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encodedPayload = base64UrlEncode(textEncoder.encode(JSON.stringify(payload)))
  const dataToSign = `${ENCODED_HS256_HEADER}.${encodedPayload}`
  const key = await getHmacKey(secret)

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(dataToSign),
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
    if (!isSupportedJwtHeader(encodedHeader)) return null

    const dataToVerify = `${encodedHeader}.${encodedPayload}`
    const key = await getHmacKey(secret)

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(encodedSignature),
      textEncoder.encode(dataToVerify),
    )
    if (!isValid) return null

    const payload = JSON.parse(textDecoder.decode(base64UrlDecode(encodedPayload)))
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    const record = payload as Record<string, unknown>
    const exp = record.exp
    if (typeof exp !== 'number' || !Number.isFinite(exp) || Date.now() >= exp * 1000) return null
    return record
  } catch {
    return null
  }
}
