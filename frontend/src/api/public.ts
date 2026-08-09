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

export interface VersionInfo {
  version: string
  commit_hash: string
  short_hash: string
  build_time: string | null
}

export const publicApi = {
  getConfig: () => {
    return request<ApiResponse<PublicConfig>>({
      url: '/api/config',
      method: 'GET',
    })
  },
  getVersion: () => {
    return request<ApiResponse<VersionInfo>>({
      url: '/api/version',
      method: 'GET',
    })
  },
}
