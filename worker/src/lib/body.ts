export class BodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large')
    this.name = 'BodyTooLargeError'
  }
}

export class InvalidBodyError extends Error {
  constructor() {
    super('Request body is invalid')
    this.name = 'InvalidBodyError'
  }
}

export async function readStructuredBody(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const bytes = await readBodyBytes(request, maxBytes)
  if (bytes.byteLength === 0) return {}

  const contentType = request.headers.get('Content-Type') || ''

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await new Response(bytes, {
        headers: { 'Content-Type': contentType },
      }).formData()
      return Object.fromEntries(
        [...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      )
    }

    const text = new TextDecoder().decode(bytes)
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(text))
    }

    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  } catch {
    throw new InvalidBodyError()
  }
}

async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = request.headers.get('Content-Length')
  if (declaredLength) {
    const parsedLength = Number.parseInt(declaredLength, 10)
    if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      throw new BodyTooLargeError()
    }
  }

  if (!request.body) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new BodyTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}
