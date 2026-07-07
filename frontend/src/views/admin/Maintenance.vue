<template>
  <div class="maintenance-tools">
    <!-- 系统状态卡片 -->
    <el-row :gutter="20" class="status-row">
      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" color="#67c23a"><CircleCheckFilled /></el-icon>
            <div class="status-info">
              <h4>{{ t('maintenance.systemStatus') }}</h4>
              <p class="text-success">{{ t('storage.statusOk') }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" color="#409eff"><Timer /></el-icon>
            <div class="status-info">
              <h4>{{ t('common.version') }}</h4>
              <p>{{ systemInfo.version }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" color="#e6a23c"><Files /></el-icon>
            <div class="status-info">
              <h4>{{ t('storage.totalFiles') }}</h4>
              <p>{{ systemInfo.totalFiles }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" color="#f56c6c"><Folder /></el-icon>
            <div class="status-info">
              <h4>{{ t('storage.totalSize') }}</h4>
              <p>{{ formatFileSize(systemInfo.totalSize) }}</p>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 维护工具 -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="tool-card">
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
              >
                {{ t('common.execute') }}
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card class="tool-card">
          <template #header>
            <div class="card-header">
              <el-icon><DocumentChecked /></el-icon>
              <span>{{ t('maintenance.systemInfo') }}</span>
            </div>
          </template>

          <el-descriptions :column="1" border>
            <el-descriptions-item :label="t('common.runtime')">
              {{ systemInfo.goVersion }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('common.buildTime')">
              {{ systemInfo.buildTime }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('maintenance.gitCommit')">
              {{ systemInfo.gitCommit }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('common.platform')">
              {{ systemInfo.osInfo }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('maintenance.cpu')">
              {{ systemInfo.cpuCores }}
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
const { t } = useI18n()

const systemInfo = reactive({
  version: '-',
  goVersion: '-',
  buildTime: '-',
  gitCommit: '-',
  osInfo: '-',
  cpuCores: 0,
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
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('maintenance.cleanFailed'))
    }
  } finally {
    cleaningExpired.value = false
  }
}

const fetchSystemInfo = async () => {
  try {
    // 获取系统信息
    const infoRes = await adminApi.getSystemInfo()
    if (infoRes.code === 200 && infoRes.data) {
      systemInfo.version = infoRes.data.filecodebox_version || '-'
      systemInfo.goVersion = infoRes.data.go_version || '-'
      systemInfo.buildTime = infoRes.data.build_time || '-'
      systemInfo.gitCommit = infoRes.data.git_commit || '-'
      systemInfo.osInfo = infoRes.data.os_info || '-'
      systemInfo.cpuCores = infoRes.data.cpu_cores || 0
    }

    // 获取统计数据
    const statsRes = await adminApi.getStats()
    if (statsRes.code === 200 && statsRes.data) {
      systemInfo.totalFiles = statsRes.data.total_files || 0
      systemInfo.totalSize = statsRes.data.total_size || 0
    }
  } catch (error) {
    console.error('Failed to load system info:', error)
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
  gap: 15px;
}

.status-info h4 {
  margin: 0 0 5px;
  font-size: 14px;
  color: #909399;
}

.status-info p {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.text-success {
  color: #67c23a !important;
}

.tool-card {
  margin-bottom: 20px;
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
  color: #909399;
}
</style>
