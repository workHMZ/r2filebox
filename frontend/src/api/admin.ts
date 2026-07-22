import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'

export interface AdminStats {
  total_files: number
  text_shares: number
  total_shares: number
  active_shares: number
  expired_shares: number
  total_size: number
  today_uploads: number
  total_downloads: number
}

export interface AdminUser {
  id: string
  username: string
  nickname: string
  role: 'admin'
}

interface AdminSessionData {
  user: AdminUser
}

export interface AdminShare {
  id: string
  type: 'text' | 'file'
  display_name: string | null
  size_bytes: number
  download_count: number
  max_downloads: number | null
  created_at: string
  expire_at: string
}

export interface AdminConfig {
  base: {
    name: string
    description: string
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
    }
    rate_limit: {
      enabled: number
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

export interface AdminSystemInfo {
  runtime: string
  platform: string
  storage: string
  version: string
  r2_bucket_name: string | null
  d1_database_name: string | null
}

export interface AuditLog {
  id: string
  action: string
  share_id: string | null
  subject_type: string | null
  subject_name: string | null
  size_bytes: number | null
  ip_hash_prefix: string | null
  status: string
  created_at: string
}

interface AdminFilesData {
  items: AdminShare[]
  total: number
  page: number
  page_size: number
}

interface AuditLogsData {
  items: AuditLog[]
  pagination: { page: number; page_size: number; total: number }
  stats: {
    total: number
    completedShares: number
    completedRetrievals: number
    activeSources: number
  }
}

export const adminApi = {
  login: (data: { username: string; password: string }) => request<ApiResponse<AdminSessionData>>({
    url: '/admin/login',
    method: 'POST',
    data,
    suppressErrorMessage: true,
    suppressAuthRedirect: true,
  }),

  getSession: () => request<ApiResponse<AdminSessionData>>({
    url: '/admin/session',
    method: 'GET',
    suppressErrorMessage: true,
    suppressAuthRedirect: true,
  }),

  logout: () => request<ApiResponse<void>>({
    url: '/admin/logout',
    method: 'POST',
    suppressErrorMessage: true,
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

  getAuditLogs: (params: { page?: number; page_size?: number }) => request<ApiResponse<AuditLogsData>>({
    url: '/admin/logs/audit',
    method: 'GET',
    params,
  }),

  getSystemInfo: () => request<ApiResponse<AdminSystemInfo>>({
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
    failures: number
  }>>({
    url: '/admin/maintenance/clean-expired',
    method: 'POST',
  }),
}
