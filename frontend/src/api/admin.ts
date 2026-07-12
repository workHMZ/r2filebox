import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'

export interface AdminStats {
  total_files: number
  text_shares: number
  total_shares: number
  active_shares: number
  expired_shares: number
  total_size: number
  total_storage_bytes: number
  today_uploads: number
  total_downloads: number
}

export interface AdminUser {
  id: string
  username: string
  nickname: string
  role: 'admin'
}

export interface AdminShare {
  id: string
  code: string
  type: 'text' | 'file'
  text: boolean
  uuid_file_name: string | null
  display_name: string | null
  file_name: string | null
  size: number
  used_count: number
  download_count: number
  max_downloads: number | null
  CreatedAt: string
  created_at: string
  expired_at: string
  expire_time: string
}

export interface AdminConfig {
  base: {
    name: string
    description: string
    port: number
    production: boolean
  }
  storage: {
    type: string
    max_size: number
    max_total_storage_bytes: number
  }
  transfer: {
    max_count: number
    expire_default: number
    upload: {
      openupload: number
      uploadsize: number
      enablechunk: number
      chunksize: number
    }
    rate_limit: {
      enable_kv: number
      upload_per_minute: number
      upload_part_per_minute: number
      resolve_per_minute: number
      download_per_minute: number
      auth_per_15_min: number
    }
  }
  security: {
    enable_audit_log: number
    enable_access_log: number
    require_turnstile: number
    turnstile_site_key: string
  }
}

export interface TransferLog {
  id: string
  operation: string
  action: string
  file_code: string
  file_name: string
  file_size: number
  username: string
  ip: string
  status: string
  created_at: string
}

interface AdminFilesData {
  items: AdminShare[]
  list: AdminShare[]
  total: number
  page: number
  page_size: number
}

interface TransferLogsData {
  items: TransferLog[]
  logs: TransferLog[]
  total: number
  page: number
  page_size: number
  pagination: { page: number; page_size: number; total: number }
  stats: { total: number; uploads: number; downloads: number; activeUsers: number }
}

export const adminApi = {
  login: (data: { username: string; password: string }) => request<ApiResponse<{
    token: string
    user: AdminUser
  }>>({
    url: '/admin/login',
    method: 'POST',
    data,
  }),

  logout: () => request<ApiResponse<void>>({
    url: '/admin/logout',
    method: 'POST',
  }),

  getStats: () => request<ApiResponse<AdminStats>>({
    url: '/admin/stats',
    method: 'GET',
  }),

  getDashboardStats: () => adminApi.getStats(),

  getFiles: (params: { page?: number; page_size?: number }) => request<ApiResponse<AdminFilesData>>({
    url: '/admin/files',
    method: 'GET',
    params,
  }),

  deleteFile: (id: string) => request<ApiResponse<void>>({
    url: `/admin/files/${encodeURIComponent(id)}`,
    method: 'DELETE',
  }),

  getRecentFiles: () => request<ApiResponse<AdminFilesData>>({
    url: '/admin/files',
    method: 'GET',
    params: { page: 1, page_size: 5 },
  }),

  getUploadTrend: (days = 7) => request<ApiResponse<Array<{ date: string; uploads: number }>>>({
    url: '/admin/stats/trend',
    method: 'GET',
    params: { days },
  }),

  getFileTypeDistribution: () => request<ApiResponse<Array<{ mime_type: string; count: number }>>>({
    url: '/admin/stats/file-types',
    method: 'GET',
  }),

  getConfig: () => request<ApiResponse<AdminConfig>>({
    url: '/admin/config',
    method: 'GET',
  }),

  updateConfig: (config: unknown) => request<ApiResponse<AdminConfig>>({
    url: '/admin/config',
    method: 'PUT',
    data: { config },
  }),

  getTransferLogs: (params: { page?: number; page_size?: number }) => request<ApiResponse<TransferLogsData>>({
    url: '/admin/logs/transfer',
    method: 'GET',
    params,
  }),

  getSystemInfo: () => request<ApiResponse<{
    runtime: string
    platform: string
    storage: string
    version: string
  }>>({
    url: '/admin/maintenance/system-info',
    method: 'GET',
  }),

  cleanExpiredFiles: () => request<ApiResponse<{
    deleted_count: number
    deleted_r2_objects: number
    aborted_uploads: number
    purged_counters: number
    purged_audit_logs: number
    purged_shares: number
  }>>({
    url: '/admin/maintenance/clean-expired',
    method: 'POST',
  }),
}
