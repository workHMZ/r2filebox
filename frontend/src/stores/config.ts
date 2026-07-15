import { defineStore } from 'pinia'
import { ref } from 'vue'
import { publicApi, type PublicConfig } from '@/api/public'
import { t } from '@/i18n'

export const useConfigStore = defineStore('config', () => {
  const config = ref<PublicConfig | null>(null)
  const loadFailed = ref(false)
  let requestVersion = 0
  let pendingRequest: Promise<PublicConfig | null> | null = null

  // 获取配置
  const fetchConfig = (force = false): Promise<PublicConfig | null> => {
    // 如果已经加载过且不强制刷新，直接返回
    if (config.value && !force) {
      return Promise.resolve(config.value)
    }
    if (pendingRequest && !force) {
      return pendingRequest
    }

    const currentVersion = ++requestVersion
    loadFailed.value = false

    const request = (async () => {
      try {
        const res = await publicApi.getConfig()
        if (currentVersion !== requestVersion) return config.value

        if (res.code === 200 && res.data) {
          config.value = res.data
          return res.data
        }
        loadFailed.value = true
      } catch (error) {
        if (currentVersion === requestVersion) {
          loadFailed.value = true
          console.error('获取配置失败:', error)
        }
      } finally {
        if (currentVersion === requestVersion) {
          pendingRequest = null
        }
      }

      return null
    })()

    pendingRequest = request
    return request
  }

  // 刷新配置（管理员修改配置后调用）
  const refreshConfig = () => fetchConfig(true)

  // 获取站点名称
  const siteName = () => {
    return config.value?.name || 'R2FileBox'
  }

  // 获取站点描述
  const siteDescription = () => {
    return config.value?.description || t('app.description')
  }

  return {
    config,
    loadFailed,
    fetchConfig,
    refreshConfig,
    siteName,
    siteDescription,
  }
})
