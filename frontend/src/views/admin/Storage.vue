<template>
  <div class="storage-management">
    <el-card v-loading="loading">
      <template #header>
        <h3>{{ t('storage.title') }}</h3>
      </template>

      <el-descriptions :column="2" border>
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
        <el-descriptions-item :label="t('storage.startedAt')">
          {{ formatDate(storageInfo.sysStart) }}
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
          <p>• {{ t('storage.tipR2') }}</p>
          <p>• {{ t('storage.tipD1') }}</p>
          <p>• {{ t('storage.tipWorker') }}</p>
          <p>• {{ t('storage.version') }}：{{ storageInfo.version }}</p>
        </el-alert>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { adminApi } from '@/api/admin'
import { getLocaleTag, useI18n } from '@/i18n'

const loading = ref(false)
const { t, locale } = useI18n()

const storageInfo = reactive({
  totalFiles: 0,
  totalSize: 0,
  sysStart: '',
  version: ''
})

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (timestamp: string): string => {
  if (!timestamp) return '-'
  try {
    const date = /^\d+$/.test(timestamp) ? new Date(parseInt(timestamp, 10)) : new Date(timestamp)
    return date.toLocaleString(getLocaleTag(locale.value))
  } catch {
    return '-'
  }
}

const fetchStorageInfo = async () => {
  loading.value = true
  try {
    const res = await adminApi.getSystemInfo()
    if (res.code === 200 && res.data) {
      storageInfo.version = res.data.filecodebox_version || 'v1.0.0'
    }

    // 获取统计数据
    const statsRes = await adminApi.getStats()
    if (statsRes.code === 200 && statsRes.data) {
      storageInfo.totalFiles = statsRes.data.total_files || 0
      storageInfo.totalSize = statsRes.data.total_size || 0
      storageInfo.sysStart = statsRes.data.sys_start || ''
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

.storage-tips p {
  margin: 5px 0;
  line-height: 1.8;
}
</style>
