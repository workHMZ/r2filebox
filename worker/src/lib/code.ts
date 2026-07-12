export const generateCode = (length: number = 6): string => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let code = ''

  const unbiasedLimit = Math.floor(256 / chars.length) * chars.length
  while (code.length < length) {
    const randomBytes = new Uint8Array(Math.max(16, length - code.length))
    crypto.getRandomValues(randomBytes)
    for (const value of randomBytes) {
      if (value >= unbiasedLimit) continue
      code += chars[value % chars.length]
      if (code.length === length) break
    }
  }

  return code
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashCode(rawCode: string, pepper: string): Promise<string> {
  return sha256Hex(`${pepper}:${rawCode}`)
}

export async function hashIp(ip: string | null, pepper: string): Promise<string | null> {
  if (!ip) return null
  return sha256Hex(`${pepper}:${ip}`)
}
