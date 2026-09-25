import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import { t } from '@/i18n'
import { formatApiError } from '@/utils/error'
import { sendUploadPart } from '@/utils/upload-transport'

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
  uploadFilePart: async (
    uploadToken: string,
    partNumber: number,
    chunk: Blob,
    signal?: AbortSignal,
    onProgress?: (sentBytes: number) => void,
  ): Promise<ApiResponse<FileUploadPartData>> => {
    const response = await sendUploadPart(uploadToken, partNumber, chunk, signal, onProgress)
      .catch((cause: unknown) => {
        if (cause instanceof TypeError) throw new TypeError(t('request.network'))
        throw cause
      })
    let data: ApiResponse<FileUploadPartData> | null = null
    try { data = JSON.parse(response.responseText) as ApiResponse<FileUploadPartData> } catch { /* Invalid response. */ }
    if (response.status < 200 || response.status > 299 || data?.code !== 200) {
      const seconds = response.retryAfter === null ? Number.NaN : Number(response.retryAfter)
      throw new UploadPartError(
        data ? formatApiError(data, 'upload.failed') : t('upload.failed'),
        response.status,
        data?.error_code ?? null,
        Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null,
      )
    }
    return data
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
