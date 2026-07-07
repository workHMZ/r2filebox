import { request } from '@/utils/request'
import type { ApiResponse, PaginatedResponse } from '@/types/common'

export const adminApi = {
  // 管理员登录
  login: (data: { username: string; password: string }) => {
    return request<ApiResponse<{
      token: string
      user: {
        id: string
        username: string
        nickname: string
        role: string
      }
    }>>({
      url: '/admin/login',
      method: 'POST',
      data,
    })
  },

  // 获取系统统计
  getStats: () => {
    return request<ApiResponse<{
      total_files: number
      text_shares: number
      total_shares: number
      active_shares: number
      expired_shares: number
      total_size: number
      today_uploads: number
      today_downloads: number
    }>>({
      url: '/admin/stats',
      method: 'GET',
    })
  },

  // 别名：获取仪表板统计
  getDashboardStats: () => adminApi.getStats(),

  // 获取文件列表
  getFiles: (params: {
    page?: number
    page_size?: number
    keyword?: string
    sort_by?: string
  }) => {
    return request<PaginatedResponse<{
      id: number
      code: string
      file_name: string
      file_size: number
      expire_time: string
      view_count: number
      download_count: number
      created_at: string
    }>>({
      url: '/admin/files',
      method: 'GET',
      params,
    })
  },

  // 别名：获取文件列表
  getFilesList: (params: {
    page?: number
    page_size?: number
    keyword?: string
    sort_by?: string
  }) => adminApi.getFiles(params),

  // 删除文件（按Code）
  deleteFile: (code: string) => {
    return request<ApiResponse<void>>({
      url: `/admin/files/${code}`,
      method: 'DELETE',
    })
  },

  // 删除文件（按ID）
  deleteFileById: (id: number) => {
    return request<ApiResponse<void>>({
      url: `/admin/files/${id}`,
      method: 'DELETE',
    })
  },

  // 删除文件（按Code）
  deleteFileByCode: (code: string) => {
    return request<ApiResponse<void>>({
      url: `/admin/files/${code}`,
      method: 'DELETE',
    })
  },

  // 获取最新文件（用于 Dashboard）
  getRecentFiles: () => {
    return request<ApiResponse<any[]>>({
      url: '/admin/files',
      method: 'GET',
      params: { page: 1, page_size: 5 }
    })
  },

  // 批量删除文件（后端未实现，待后端实现后启用）
  batchDeleteFiles: (codes: string[]) => {
    return request<ApiResponse<{ deleted_count: number }>>({
      url: '/admin/files/batch',
      method: 'DELETE',
      data: { codes }
    })
  },


  getUploadTrend: (days: number = 7) => {
    return request<ApiResponse<any[]>>({
      url: '/admin/stats/trend',
      method: 'GET',
      params: { days }
    })
  },

  getFileTypeDistribution: () => {
    return request<ApiResponse<any[]>>({
      url: '/admin/stats/file-types',
      method: 'GET'
    })
  },
  // 获取系统配置
  getConfig: () => {
    return request<ApiResponse<{
      base: {
        name: string
        description: string
        port: number
      }
      storage: {
        type: string
        max_size: number
      }
      transfer: {
        max_count: number
        expire_default: number
        upload?: any
        rate_limit?: any
      }
      user?: any
      security?: any
    }>>({
      url: '/admin/config',
      method: 'GET',
    })
  },

  // 别名：获取系统配置
  getSystemConfig: () => adminApi.getConfig(),

  // 更新系统配置
  updateConfig: (config: any) => {
    return request<ApiResponse<void>>({
      url: '/admin/config',
      method: 'PUT',
      data: { config },
    })
  },

  // 更新基础配置
  updateBasicConfig: (data: any) => adminApi.updateConfig({ basic: data }),

  // 更新安全配置
  updateSecurityConfig: (data: any) => adminApi.updateConfig({ security: data }),

  // 更新邮件配置
  updateEmailConfig: (data: any) => adminApi.updateConfig({ email: data }),

  // 获取传输日志
  getTransferLogs: (params: {
    page?: number
    page_size?: number
  }) => {
    return request<PaginatedResponse<any>>({
      url: '/admin/logs/transfer',
      method: 'GET',
      params,
    })
  },

  // 获取系统信息
  getSystemInfo: () => {
    return request<ApiResponse<{
      go_version: string
      build_time: string
      git_commit: string
      os_info: string
      cpu_cores: number
      filecodebox_version: string
    }>>({
      url: '/admin/maintenance/system-info',
      method: 'GET'
    })
  },

  // 测试邮件（后端未实现，待后端实现后启用）
  testEmail: () => {
    return request<ApiResponse<void>>({
      url: '/admin/email/test',
      method: 'POST'
    })
  },

  // 清理过期文件
  cleanExpiredFiles: () => {
    return request<ApiResponse<{ deleted_count: number }>>({
      url: '/admin/maintenance/clean-expired',
      method: 'POST'
    })
  },

  // 清理孤立文件（后端未实现，待后端实现后启用）
  cleanOrphanFiles: () => {
    return request<ApiResponse<{ deleted_count: number }>>({
      url: '/admin/maintenance/clean-orphan',
      method: 'POST'
    })
  },

  // 优化数据库（后端未实现，待后端实现后启用）
  optimizeDatabase: () => {
    return request<ApiResponse<void>>({
      url: '/admin/maintenance/optimize',
      method: 'POST'
    })
  },

  // 导出数据（后端未实现，待后端实现后启用）
  exportData: () => {
    return request<ApiResponse<{ download_url: string }>>({
      url: '/admin/export',
      method: 'GET'
    })
  },
}
