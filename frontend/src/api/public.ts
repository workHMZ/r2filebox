import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'

export interface PublicConfig {
  name: string
  appName?: string
  description: string
  appDescription?: string
  uploadSize: number
  maxUploadBytes?: number
  enableChunk: number
  openUpload: number
  expireStyle: string[]
  initialized?: boolean
  enableFileShare?: boolean
  enableTextShare?: boolean
  enablePublicUpload?: boolean
  requireTurnstile?: boolean
  turnstileSiteKey?: string
}

export const publicApi = {
  getConfig: () => {
    return request<ApiResponse<PublicConfig>>({
      url: '/api/config',
      method: 'GET',
    })
  },
}
