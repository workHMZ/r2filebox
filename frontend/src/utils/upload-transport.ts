const STALL_TIMEOUT_MS = 120_000
const REQUEST_TIMEOUT_MS = 30 * 60_000

interface UploadResponse {
  status: number
  responseText: string
  retryAfter: string | null
}

/** Bound stalled requests while allowing slow uploads that keep progressing. */
export function sendUploadPart(
  uploadToken: string,
  partNumber: number,
  chunk: Blob,
  signal?: AbortSignal,
  onProgress?: (sentBytes: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const cancellation = () => signal?.reason instanceof DOMException
      ? signal.reason : new DOMException('Upload cancelled', 'AbortError')
    if (signal?.aborted) { reject(cancellation()); return }
    const xhr = new XMLHttpRequest()
    let settled = false
    let stallTimer: ReturnType<typeof setTimeout> | undefined
    let uploaded = 0
    const finish = (settle: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(stallTimer)
      signal?.removeEventListener('abort', onAbort)
      settle()
    }
    const onAbort = () => {
      finish(() => reject(cancellation()))
      xhr.abort()
    }
    const failNetwork = () => finish(() => reject(new TypeError('Upload network failure')))
    const armStallTimer = () => {
      clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        // Settle before abort fires, so a timeout remains retryable.
        failNetwork()
        xhr.abort()
      }, STALL_TIMEOUT_MS)
    }
    xhr.open('PUT', '/api/share/file/part', true)
    xhr.responseType = 'text'
    xhr.withCredentials = true
    xhr.timeout = REQUEST_TIMEOUT_MS
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('X-Upload-Token', uploadToken)
    xhr.setRequestHeader('X-Part-Number', String(partNumber))
    xhr.upload.onprogress = (event) => {
      if (settled) return
      if (event.loaded > uploaded) { uploaded = event.loaded; armStallTimer() }
      onProgress?.(event.loaded)
    }
    xhr.onerror = failNetwork
    xhr.ontimeout = failNetwork
    xhr.onabort = () => finish(() => reject(cancellation()))
    xhr.onload = () => finish(() => resolve({
      status: xhr.status,
      responseText: xhr.responseText,
      retryAfter: xhr.getResponseHeader('Retry-After'),
    }))
    signal?.addEventListener('abort', onAbort, { once: true })
    armStallTimer()
    try { xhr.send(chunk) } catch (cause) { finish(() => reject(cause)) }
  })
}
