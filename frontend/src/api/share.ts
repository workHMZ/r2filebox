import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import { t } from '@/i18n'

export const shareApi = {
  // 分享文本
  shareText: (data: {
    text: string
    expire_value: number
    expire_style: string
  }) => {
    const formData = new FormData()
    formData.append('text', data.text)
    formData.append('expire_value', String(data.expire_value))
    formData.append('expire_style', data.expire_style)

    return request<ApiResponse<{
      code: string
      share_url: string
      full_share_url: string
      qr_code_data: string
    }>>({
      url: '/api/share/text',
      method: 'POST',
      data: formData,
    })
  },

  // 分享文件
  initFileUpload: (data: {
    filename: string
    mimeType: string
    size: number
    expire_value: number
    expire_style: string
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
  getShare: (code: string, password?: string) => {
    return request<ApiResponse<{
      code: string
      text?: string
      file_name?: string
      file_size?: string
      url?: string
      has_password: boolean
      expire_time: string
    }>>({
      url: '/api/share/resolve',
      method: 'POST',
      data: { code, password },
    })
  },

}
