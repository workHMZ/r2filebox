export const generateCode = (length: number = 6): string => {
  // Exclude confusing characters: 0, O, I, l, 1
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let code = ''
  
  // Use crypto for better randomness
  const randomBytes = new Uint8Array(length)
  crypto.getRandomValues(randomBytes)
  
  for (let i = 0; i < length; i++) {
    code += chars[randomBytes[i] % chars.length]
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
