import axios from 'axios'
import type { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { t } from '@/i18n'
import type { ApiResponse } from '@/types/common'
import { ApiError, formatApiError } from '@/utils/error'

export interface RequestConfig extends AxiosRequestConfig {
  suppressErrorMessage?: boolean
  suppressAuthRedirect?: boolean
}

const instance: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 30000,
  withCredentials: true,
})

let lastMessage = ''
let lastMessageAt = 0
let authRedirecting = false

// 响应拦截器
instance.interceptors.response.use(
  (response) => {
    if (isAdminApi(response.config.url)) authRedirecting = false
    // 针对 HTTP 200 响应中包含的业务失败格式化 message
    if (
      response.data &&
      typeof response.data === 'object' &&
      (response.data as ApiResponse).success === false
    ) {
      const res = response.data as ApiResponse
      res.message = formatApiError(res)
    }
    return response
  },
  (error: AxiosError<ApiResponse>) => {
    const config = (error.config || {}) as RequestConfig
    const responseData = error.response?.data

    const apiError = new ApiError(
      responseData?.message || error.message || t('request.failed'),
      error.response?.status || 500,
      responseData?.error_code,
      responseData?.params,
    )

    const userFriendlyMessage = error.response
      ? formatApiError(apiError)
      : t('request.network')

    // 更新 ApiError 对象的 message 属性为本地化文案
    apiError.message = userFriendlyMessage

    if (error.response) {
      showErrorOnce(userFriendlyMessage, config)

      if (
        error.response.status === 401 &&
        isAdminApi(error.config?.url) &&
        error.config?.url !== '/admin/login' &&
        !config.suppressAuthRedirect &&
        !authRedirecting
      ) {
        authRedirecting = true
        window.location.replace(`${window.location.pathname}${window.location.search}#/admin/login`)
      }
    } else {
      showErrorOnce(userFriendlyMessage, config)
    }

    return Promise.reject(apiError)
  },
)

export const request = <T = unknown>(config: RequestConfig): Promise<T> => {
  return instance.request<T>(config).then((response) => response.data)
}

function showErrorOnce(message: string, config: RequestConfig): void {
  if (config.suppressErrorMessage) return
  const now = Date.now()
  if (message === lastMessage && now - lastMessageAt < 1500) return
  lastMessage = message
  lastMessageAt = now
  ElMessage.error(message)
}

function isAdminApi(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url, window.location.origin)
    return parsed.origin === window.location.origin &&
      (parsed.pathname === '/admin' || parsed.pathname.startsWith('/admin/'))
  } catch {
    return false
  }
}

export default instance
