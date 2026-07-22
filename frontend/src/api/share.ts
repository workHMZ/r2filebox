import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import { t } from '@/i18n'

export class UploadPartError extends Error {
  readonly status: number
  readonly retryAfterMs: number | null

  constructor(
    message: string,
    status: number,
    retryAfterMs: number | null,
  ) {
    super(message)
    this.name = 'UploadPartError'
    this.status = status
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
}

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
  }, signal?: AbortSignal) => {
    return request<ApiResponse<{
      code: string
      uploadToken: string
      partSize: number
      partCount: number
    }>>({
      url: '/api/share/file/init',
      method: 'POST',
      data,
      signal,
      suppressErrorMessage: true,
    })
  },

  uploadFilePart: async (
    uploadToken: string,
    partNumber: number,
    chunk: Blob,
    signal?: AbortSignal,
  ) => {
    const res = await fetch(`/api/share/file/part`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Upload-Token': uploadToken,
        'X-Part-Number': String(partNumber),
      },
      body: chunk,
      signal,
    })
    const data = await res.json().catch(() => null) as ApiResponse<{
      partNumber: number
      etag: string
    }> | null
    if (!res.ok || data?.code !== 200) {
      const retryAfter = res.headers.get('Retry-After')
      const seconds = retryAfter === null ? Number.NaN : Number(retryAfter)
      throw new UploadPartError(
        data?.message || t('upload.failed'),
        res.status,
        Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null,
      )
    }
    return data
  },

  completeFileUpload: (data: {
    uploadToken: string
    code: string
    parts: Array<{ partNumber: number; etag: string }>
  }, signal?: AbortSignal) => {
    return request<ApiResponse<{
      code: string
      share_url: string
      full_share_url: string
      qr_code_data: string
      file_name: string
      size_bytes: number
      expire_at: string
      max_downloads: number | null
    }>>({
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
