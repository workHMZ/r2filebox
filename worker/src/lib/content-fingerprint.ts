export const CONTENT_FINGERPRINT_ALGORITHM = 'sha256-tree-v1'
export const CONTENT_FINGERPRINT_PART_SIZE = 8 * 1024 * 1024

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/

export const isValidContentFingerprint = (value: unknown): value is string => {
  return typeof value === 'string' && SHA256_HEX_PATTERN.test(value)
}

export async function sha256Bytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return bytesToHex(new Uint8Array(digest))
}

export async function deriveContentFingerprint(
  sizeBytes: number,
  partSha256: readonly string[],
): Promise<string> {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new RangeError('Content fingerprint size must be a positive safe integer')
  }

  const expectedPartCount = Math.ceil(sizeBytes / CONTENT_FINGERPRINT_PART_SIZE)
  if (
    partSha256.length !== expectedPartCount ||
    !partSha256.every(isValidContentFingerprint)
  ) {
    throw new RangeError('Content fingerprint parts are invalid')
  }

  const prefix = new TextEncoder().encode(
    `r2filebox:${CONTENT_FINGERPRINT_ALGORITHM}:${CONTENT_FINGERPRINT_PART_SIZE}:${sizeBytes}:${partSha256.length}:`,
  )
  const manifestEntryBytes = 4 + 8 + 32
  const input = new Uint8Array(prefix.byteLength + (partSha256.length * manifestEntryBytes))
  input.set(prefix)
  let offset = prefix.byteLength
  const view = new DataView(input.buffer)
  for (const [index, partHash] of partSha256.entries()) {
    const partNumber = index + 1
    const partOffset = index * CONTENT_FINGERPRINT_PART_SIZE
    const partLength = Math.min(CONTENT_FINGERPRINT_PART_SIZE, sizeBytes - partOffset)
    view.setUint32(offset, partNumber)
    offset += 4
    view.setBigUint64(offset, BigInt(partLength))
    offset += 8
    input.set(hexToBytes(partHash), offset)
    offset += 32
  }
  return await sha256Bytes(input)
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
