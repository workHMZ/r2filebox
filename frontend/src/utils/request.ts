import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { t } from '@/i18n'

const instance: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 30000,
})

// 请求拦截器
instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token && isAdminApi(config.url) && config.url !== '/admin/login') {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
instance.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          ElMessage.error(t('request.unauthorized'))
          if (isAdminApi(error.config?.url)) {
            localStorage.removeItem('token')
            localStorage.removeItem('userRole')
            window.location.href = '/#/admin/login'
          }
          break
        case 403:
          ElMessage.error(t('request.forbidden'))
          break
        case 404:
          ElMessage.error(t('request.notFound'))
          break
        case 500:
          ElMessage.error(t('request.server'))
          break
        default:
          ElMessage.error(error.response.data?.message || t('request.failed'))
      }
    } else {
      ElMessage.error(t('request.network'))
    }
    return Promise.reject(error)
  }
)

export const request = <T = unknown>(config: AxiosRequestConfig): Promise<T> => {
  return instance.request<unknown, T>(config)
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
