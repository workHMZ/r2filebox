import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'

export interface PublicConfig {
  name: string
  description: string
  maxUploadBytes: number
  openUpload: number
  expireStyle: string[]
  defaultExpireHours: number
  maxExpireHours: number
  enableFileShare: boolean
  enableTextShare: boolean
  requireTurnstile: boolean
  turnstileSiteKey: string
}

export const publicApi = {
  getConfig: () => {
    return request<ApiResponse<PublicConfig>>({
      url: '/api/config',
      method: 'GET',
    })
  },
}
