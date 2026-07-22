import axios from 'axios'
import type { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { t } from '@/i18n'

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
    return response.data
  },
  (error: AxiosError<{ message?: string }>) => {
    const config = (error.config || {}) as RequestConfig
    const responseMessage = error.response?.data?.message
    if (responseMessage) error.message = responseMessage

    if (error.response) {
      switch (error.response.status) {
        case 401:
          showErrorOnce(responseMessage || t('request.unauthorized'), config)
          if (
            isAdminApi(error.config?.url) &&
            error.config?.url !== '/admin/login' &&
            !config.suppressAuthRedirect &&
            !authRedirecting
          ) {
            authRedirecting = true
            window.location.replace('/#/admin/login')
          }
          break
        case 403:
          showErrorOnce(responseMessage || t('request.forbidden'), config)
          break
        case 404:
          showErrorOnce(responseMessage || t('request.notFound'), config)
          break
        case 500:
          showErrorOnce(responseMessage || t('request.server'), config)
          break
        default:
          showErrorOnce(responseMessage || t('request.failed'), config)
      }
    } else {
      showErrorOnce(t('request.network'), config)
    }
    return Promise.reject(error)
  }
)

export const request = <T = unknown>(config: RequestConfig): Promise<T> => {
  return instance.request<unknown, T>(config)
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
