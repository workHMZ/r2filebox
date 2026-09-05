import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import { t } from '@/i18n'
import { formatApiError } from '@/utils/error'

export class UploadPartError extends Error {
  readonly status: number
  readonly errorCode: string | null
  readonly retryAfterMs: number | null

  constructor(
    message: string,
    status: number,
    errorCode: string | null,
    retryAfterMs: number | null,
  ) {
    super(message)
    this.name = 'UploadPartError'
    this.status = status
    this.errorCode = errorCode
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * The caller identifies cancellation with `instanceof DOMException` and
 * `name === 'AbortError'`, which is what fetch rejects with, so reuse the
 * signal's own reason and fall back to an equivalent DOMException.
 */
function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason instanceof DOMException
    ? signal.reason
    : new DOMException('Upload cancelled', 'AbortError')
}

export interface ResolvedShare {
  code: string
  type: 'text' | 'file'
  text?: string
  file_name?: string
  size_bytes: number
  mime_type?: string
  expire_at: string
  download_count: number
  max_downloads: number | null
  download_url?: string
  download_expires_at?: string
}

export interface FileUploadSuccessData {
  instantUpload: boolean
  code: string
  share_url: string
  full_share_url: string
  qr_code_data: string
  file_name: string
  size_bytes: number
  expire_at: string
  max_downloads: number | null
  dedupToken?: string
  dedupTokenExpiresAt?: string
}

/**
 * What the home view needs to hand a finished share to its creator. Expiry and
 * the pickup allowance travel with it: they are the two facts the creator has
 * to know before passing the link on.
 */
export interface ShareCreatedResult {
  code: string
  share_url: string
  full_share_url: string
  qr_code_data: string
  expire_at: string
  max_downloads: number | null
}

export interface FileUploadPartData {
  partNumber: number
  etag: string
  sha256: string
  partSize: number
  receipt: string
}

export interface CompletedUploadPart {
  partNumber: number
  etag: string
  sha256?: string
  partSize?: number
  receipt?: string
}

type FileUploadInitData =
  | {
    instantUpload: false
    code: string
    uploadToken: string
    partSize: number
    partCount: number
  }
  | (FileUploadSuccessData & { instantUpload: true })

export const shareApi = {
  // 分享文本
  shareText: (data: {
    text: string
    expire_value: number
    expire_style: string
    turnstileToken?: string
  }) => {
    return request<ApiResponse<{
      code: string
      share_url: string
      full_share_url: string
      qr_code_data: string
      expire_at: string
      max_downloads: number | null
    }>>({
      url: '/api/share/text',
      method: 'POST',
      data,
      suppressErrorMessage: true,
    })
  },

  // 分享文件
  initFileUpload: (data: {
    filename: string
    mimeType: string
    size: number
    expire_value: number
    expire_style: string
    turnstileToken?: string
    fingerprintAlgorithm?: string
    contentFingerprint?: string
    dedupToken?: string
  }, signal?: AbortSignal) => {
    return request<ApiResponse<FileUploadInitData>>({
      url: '/api/share/file/init',
      method: 'POST',
      data,
      signal,
      suppressErrorMessage: true,
    })
  },

  // XMLHttpRequest rather than fetch: fetch cannot report how much of a request
  // body has been sent, which left the progress bar frozen for a whole part.
  // Error, abort, and retry semantics below match the previous fetch version.
  uploadFilePart: (
    uploadToken: string,
    partNumber: number,
    chunk: Blob,
    signal?: AbortSignal,
    onProgress?: (sentBytes: number) => void,
  ): Promise<ApiResponse<FileUploadPartData>> => {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortReason(signal))
        return
      }

      const xhr = new XMLHttpRequest()
      let settled = false
      const finish = (settle: () => void) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        settle()
      }
      const onAbort = () => {
        xhr.abort()
        finish(() => reject(abortReason(signal)))
      }
      // A network-layer failure is surfaced as TypeError because that is what
      // fetch threw, and the caller's retry predicate keys off that type.
      const failNetwork = () => finish(() => reject(new TypeError(t('request.network'))))

      xhr.open('PUT', '/api/share/file/part', true)
      xhr.responseType = 'text'
      xhr.withCredentials = true
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.setRequestHeader('X-Upload-Token', uploadToken)
      xhr.setRequestHeader('X-Part-Number', String(partNumber))

      if (onProgress) {
        xhr.upload.onprogress = (event) => onProgress(event.loaded)
      }
      xhr.onerror = failNetwork
      xhr.ontimeout = failNetwork
      xhr.onabort = onAbort
      xhr.onload = () => finish(() => {
        let data: ApiResponse<FileUploadPartData> | null = null
        try {
          data = JSON.parse(xhr.responseText) as ApiResponse<FileUploadPartData>
        } catch {
          data = null
        }
        if (xhr.status < 200 || xhr.status > 299 || data?.code !== 200) {
          const retryAfter = xhr.getResponseHeader('Retry-After')
          const seconds = retryAfter === null ? Number.NaN : Number(retryAfter)
          reject(new UploadPartError(
            data ? formatApiError(data, 'upload.failed') : t('upload.failed'),
            xhr.status,
            data?.error_code ?? null,
            Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null,
          ))
          return
        }
        resolve(data)
      })

      signal?.addEventListener('abort', onAbort, { once: true })
      try {
        xhr.send(chunk)
      } catch (cause) {
        // A synchronous send() failure fires no event, so settle here or the
        // upload would wait on a promise that can never resolve.
        finish(() => reject(cause))
      }
    })
  },

  completeFileUpload: (data: {
    uploadToken: string
    code: string
    parts: CompletedUploadPart[]
  }, signal?: AbortSignal) => {
    return request<ApiResponse<FileUploadSuccessData>>({
      url: '/api/share/file/complete',
      method: 'POST',
      headers: {
        'X-Upload-Token': data.uploadToken,
      },
      data: {
        code: data.code,
        parts: data.parts,
      },
      signal,
      suppressErrorMessage: true,
    })
  },

  // 放弃一个不会再续传的上传会话，让服务端立即释放容量预留与 R2 分片
  abortFileUpload: (uploadToken: string) => {
    return request<ApiResponse<null>>({
      url: '/api/share/file/abort',
      method: 'POST',
      headers: {
        'X-Upload-Token': uploadToken,
      },
      suppressErrorMessage: true,
      suppressAuthRedirect: true,
    })
  },

  // 获取分享内容
  getShare: (code: string) => {
    return request<ApiResponse<ResolvedShare>>({
      url: '/api/share/resolve',
      method: 'POST',
      data: { code },
      suppressErrorMessage: true,
    })
  },

}
