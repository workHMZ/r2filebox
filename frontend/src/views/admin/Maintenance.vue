<template>
  <div class="maintenance-tools">
    <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {{ loadingSystemInfo ? t('common.loading') : '' }}
    </p>
    <el-row :gutter="20" class="status-row" :aria-busy="loadingSystemInfo">
      <el-col :xs="12" :md="6">
        <el-card class="status-card" shadow="never">
          <div class="status-item">
            <el-icon class="status-icon status-icon--success"><CircleCheckFilled /></el-icon>
            <div class="status-info">
              <h4>{{ t('maintenance.systemStatus') }}</h4>
              <p class="text-success">{{ t('storage.statusOk') }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="12" :md="6">
        <el-card class="status-card" shadow="never">
          <div class="status-item">
            <el-icon class="status-icon status-icon--info"><Timer /></el-icon>
            <div class="status-info">
              <h4>{{ t('common.version') }}</h4>
              <p>{{ systemInfo.version }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="12" :md="6">
        <el-card class="status-card" shadow="never">
          <div class="status-item">
            <el-icon class="status-icon status-icon--warning"><Files /></el-icon>
            <div class="status-info">
              <h4>{{ t('storage.totalFiles') }}</h4>
              <p>{{ systemInfo.totalFiles }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="12" :md="6">
        <el-card class="status-card" shadow="never">
          <div class="status-item">
            <el-icon class="status-icon status-icon--danger"><Folder /></el-icon>
            <div class="status-info">
              <h4>{{ t('storage.totalSize') }}</h4>
              <p>{{ formatFileSize(systemInfo.totalSize) }}</p>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="maintenance-grid" :aria-busy="loadingSystemInfo">
      <el-col :xs="24" :lg="12">
        <el-card class="tool-card" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon><Delete /></el-icon>
              <span>{{ t('maintenance.cleanupTools') }}</span>
            </div>
          </template>

          <div class="tool-list">
            <div class="tool-item">
              <div class="tool-info">
                <h4>{{ t('maintenance.cleanExpiredTitle') }}</h4>
                <p>{{ t('maintenance.cleanExpiredDesc') }}</p>
              </div>
              <el-button
                type="danger"
                @click="cleanExpiredFiles"
                :loading="cleaningExpired"
                :aria-busy="cleaningExpired"
              >
                {{ t('common.execute') }}
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card class="tool-card" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon><DocumentChecked /></el-icon>
              <span>{{ t('maintenance.systemInfo') }}</span>
            </div>
          </template>

          <el-descriptions :column="1" border>
            <el-descriptions-item :label="t('common.runtime')">
              {{ systemInfo.runtime }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('storage.dataLayer')">
              {{ systemInfo.storage }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('common.platform')">
              {{ systemInfo.platform }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheckFilled,
  Timer,
  Files,
  Folder,
  Delete,
  DocumentChecked
} from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { useI18n } from '@/i18n'

const cleaningExpired = ref(false)
const loadingSystemInfo = ref(false)
const { t } = useI18n()

const systemInfo = reactive({
  version: '-',
  runtime: '-',
  platform: '-',
  storage: '-',
  totalFiles: 0,
  totalSize: 0
})

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const cleanExpiredFiles = async () => {
  try {
    await ElMessageBox.confirm(
      t('maintenance.confirmClean'),
      t('maintenance.confirmCleanTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
      }
    )

    cleaningExpired.value = true
    const res = await adminApi.cleanExpiredFiles()
    if (res.code === 200) {
      ElMessage.success(t('maintenance.cleanDone', { count: res.data.deleted_count || 0 }))
      await fetchSystemInfo()
    } else {
      ElMessage.error(res.message || t('maintenance.cleanFailed'))
    }
  } catch (error: unknown) {
    if (error !== 'cancel') {
      ElMessage.error(t('maintenance.cleanFailed'))
    }
  } finally {
    cleaningExpired.value = false
  }
}

const fetchSystemInfo = async () => {
  loadingSystemInfo.value = true
  try {
    // 获取系统信息
    const infoRes = await adminApi.getSystemInfo()
    if (infoRes.code === 200 && infoRes.data) {
      systemInfo.version = infoRes.data.version || '-'
      systemInfo.runtime = infoRes.data.runtime || '-'
      systemInfo.platform = infoRes.data.platform || '-'
      systemInfo.storage = infoRes.data.storage || '-'
    }

    // 获取统计数据
    const statsRes = await adminApi.getStats()
    if (statsRes.code === 200 && statsRes.data) {
      systemInfo.totalFiles = statsRes.data.total_files || 0
      systemInfo.totalSize = statsRes.data.total_size || 0
    }
  } catch (error) {
    console.error('Failed to load system info:', error)
  } finally {
    loadingSystemInfo.value = false
  }
}

onMounted(() => {
  fetchSystemInfo()
})
</script>

<style scoped>
.maintenance-tools {
  padding: 0;
}

.status-row {
  margin-bottom: 20px;
}

.status-card {
  height: 100%;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  padding: 8px;
  border-radius: var(--radius-lg);
  font-size: 22px;
}

.status-icon--success { background: #edf8f1; color: var(--success-color); }
.status-icon--info { background: #edf4ff; color: var(--info-color); }
.status-icon--warning { background: var(--accent-soft); color: #c45c0c; }
.status-icon--danger { background: #fff0f0; color: var(--danger-color); }

.status-info h4 {
  margin: 0 0 5px;
  font-size: 14px;
  color: var(--text-secondary);
}

.status-info p {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.text-success {
  color: var(--success-color) !important;
}

.tool-card {
  margin-bottom: 20px;
}

@media (min-width: 1200px) {
  .maintenance-grid > .el-col {
    display: flex;
  }

  .maintenance-grid .tool-card {
    flex: 1;
    width: 100%;
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}

.tool-list {
  padding: 10px 0;
}

.tool-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 0;
}

.tool-info h4 {
  margin: 0 0 5px;
  font-size: 16px;
  font-weight: 600;
}

.tool-info p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

@media (max-width: 1199px) {
  .tool-card {
    margin-bottom: 14px;
  }
}

@media (max-width: 767px) {
  .status-row {
    margin-bottom: 6px;
  }

  .status-row .el-col {
    margin-bottom: 14px;
  }

  .status-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .tool-item {
    align-items: stretch;
    flex-direction: column;
    gap: 16px;
  }
}
</style>
