<template>
  <div class="storage-management">
    <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {{ loading ? t('common.loading') : '' }}
    </p>
    <el-card v-loading="loading" :aria-busy="loading" shadow="never">
      <template #header>
        <h3>{{ t('storage.title') }}</h3>
      </template>

      <el-descriptions :column="isMobile ? 1 : 2" border>
        <el-descriptions-item :label="t('storage.type')">
          <el-tag type="info">{{ t('storage.cloudflare') }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('storage.dataLayer')">
          D1 / R2 / Workers
        </el-descriptions-item>
        <el-descriptions-item :label="t('storage.totalFiles')">
          {{ storageInfo.totalFiles }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('storage.totalSize')">
          {{ formatFileSize(storageInfo.totalSize) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.status')">
          <el-tag type="success">{{ t('storage.statusOk') }}</el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <el-divider />

      <div class="storage-tips">
        <el-alert
          :title="t('storage.tipsTitle')"
          type="info"
          :closable="false"
        >
          <ul>
            <li>{{ t('storage.tipR2') }}</li>
            <li>{{ t('storage.tipD1') }}</li>
            <li>{{ t('storage.tipWorker') }}</li>
            <li>{{ t('storage.version') }}：{{ storageInfo.version }}</li>
          </ul>
        </el-alert>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { adminApi } from '@/api/admin'
import { useI18n } from '@/i18n'

const loading = ref(false)
const { t } = useI18n()
const isMobile = useMediaQuery('(max-width: 720px)')

const storageInfo = reactive({
  totalFiles: 0,
  totalSize: 0,
  version: ''
})

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const fetchStorageInfo = async () => {
  loading.value = true
  try {
    const res = await adminApi.getSystemInfo()
    if (res.code === 200 && res.data) {
      storageInfo.version = res.data.version || '1.0.0'
    }

    // 获取统计数据
    const statsRes = await adminApi.getStats()
    if (statsRes.code === 200 && statsRes.data) {
      storageInfo.totalFiles = statsRes.data.total_files || 0
      storageInfo.totalSize = statsRes.data.total_size || 0
    }
  } catch (error) {
    console.error('Failed to load storage info:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchStorageInfo()
})
</script>

<style scoped>
.storage-management {
  padding: 0;
}

.storage-tips {
  margin-top: 20px;
}

.storage-tips ul {
  margin: 0;
  padding-left: 20px;
}

.storage-tips li {
  margin: 5px 0;
  line-height: 1.8;
}
</style>
