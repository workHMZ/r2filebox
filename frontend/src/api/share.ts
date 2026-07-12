import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import { t } from '@/i18n'

export interface ResolvedShare {
  code: string
  type: 'text' | 'file'
  text?: string
  file_name?: string
  filename?: string
  file_size: number
  size?: number
  mimeType?: string
  has_password: false
  expire_time: string
  views: number
  max_views: number | null
  downloadCount: number
  maxDownloads: number | null
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
    }>>({
      url: '/api/share/text',
      method: 'POST',
      data,
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
  }) => {
    return request<ApiResponse<{
      code: string
      uploadToken: string
      uploadId: string
      partSize: number
      partCount: number
      share_url: string
      full_share_url: string
      qr_code_data: string
    }>>({
      url: '/api/share/file/init',
      method: 'POST',
      data,
    })
  },

  uploadFilePart: async (uploadToken: string, partNumber: number, chunk: Blob) => {
    const res = await fetch(`/api/share/file/part`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Upload-Token': uploadToken,
        'X-Part-Number': String(partNumber),
      },
      body: chunk,
    })
    const data = await res.json()
    if (!res.ok || data.code !== 200) {
      throw new Error(data.message || t('upload.failed'))
    }
    return data as ApiResponse<{ partNumber: number; etag: string }>
  },

  completeFileUpload: (data: {
    uploadToken: string
    code: string
    parts: Array<{ partNumber: number; etag: string }>
  }) => {
    return request<ApiResponse<{
      code: string
      share_url: string
      full_share_url: string
      qr_code_data: string
      file_name: string
      size: number
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
    })
  },

  abortFileUpload: (uploadToken: string) => {
    return request<ApiResponse<void>>({
      url: '/api/share/file/abort',
      method: 'POST',
      headers: {
        'X-Upload-Token': uploadToken,
      },
    })
  },

  // 获取分享内容
  getShare: (code: string) => {
    return request<ApiResponse<ResolvedShare>>({
      url: '/api/share/resolve',
      method: 'POST',
      data: { code },
    })
  },

}
