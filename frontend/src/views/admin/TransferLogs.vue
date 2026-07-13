<template>
  <div class="transfer-logs">
    <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {{ loading ? t('common.loading') : '' }}
    </p>
    <el-card v-loading="loading" :aria-busy="loading" shadow="never">
      <template #header>
        <div class="card-header">
          <h3>{{ t('logs.title') }}</h3>
          <el-button @click="fetchLogs" :icon="Refresh" size="small">
            {{ t('common.refresh') }}
          </el-button>
        </div>
      </template>

      <!-- 统计卡片 -->
      <el-row :gutter="20" class="stats-row">
        <el-col :xs="12" :md="6">
          <div class="stat-item">
            <div class="stat-value">{{ stats.totalOperations }}</div>
            <div class="stat-label">{{ t('logs.totalOperations') }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :md="6">
          <div class="stat-item upload">
            <div class="stat-value">{{ stats.uploads }}</div>
            <div class="stat-label">{{ t('logs.uploads') }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :md="6">
          <div class="stat-item download">
            <div class="stat-value">{{ stats.downloads }}</div>
            <div class="stat-label">{{ t('logs.downloads') }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :md="6">
          <div class="stat-item">
            <div class="stat-value">{{ stats.activeUsers }}</div>
            <div class="stat-label">{{ t('logs.activeClients') }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- 日志列表 -->
      <el-table
        :data="logsList"
        table-layout="auto"
        :scrollbar-tabindex="0"
        stripe
      >
        <el-table-column prop="id" label="ID" width="80" />

        <el-table-column prop="operation" :label="t('logs.operation')" width="100">
          <template #default="{ row }">
            <el-tag :type="getOperationType(row.operation)" size="small">
              {{ getOperationLabel(row.operation) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="file_code" :label="t('logs.fileCode')" width="120" />

        <el-table-column prop="file_name" :label="t('logs.fileName')" show-overflow-tooltip />

        <el-table-column prop="file_size" :label="t('logs.fileSize')" width="120">
          <template #default="{ row }">
            {{ formatFileSize(row.file_size) }}
          </template>
        </el-table-column>

        <el-table-column prop="ip" :label="t('logs.ip')" width="140" />

        <el-table-column prop="created_at" :label="t('logs.operationTime')" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import type { TransferLog } from '@/api/admin'
import { getLocaleTag, useI18n } from '@/i18n'

const loading = ref(false)
const logsList = ref<TransferLog[]>([])
const { t, locale } = useI18n()

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const stats = reactive({
  totalOperations: 0,
  uploads: 0,
  downloads: 0,
  activeUsers: 0
})

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString(getLocaleTag(locale.value))
  } catch {
    return '-'
  }
}

const getOperationLabel = (operation: string): string => {
  const labels: Record<string, string> = {
    upload: t('logs.upload'),
    download: t('logs.download'),
    delete: t('logs.delete'),
    view: t('logs.view')
  }
  return labels[operation] || operation
}

const getOperationType = (operation: string): string => {
  const types: Record<string, string> = {
    upload: 'success',
    download: 'primary',
    delete: 'danger',
    view: 'info'
  }
  return types[operation] || ''
}

const fetchLogs = async () => {
  loading.value = true
  try {
    const res = await adminApi.getTransferLogs({
      page: pagination.page,
      page_size: pagination.pageSize
    })

    if (res.code === 200) {
      logsList.value = res.data.logs
      pagination.total = res.data.pagination.total
      stats.totalOperations = res.data.stats.total
      stats.uploads = res.data.stats.uploads
      stats.downloads = res.data.stats.downloads
      stats.activeUsers = res.data.stats.activeUsers
    }
  } catch (error) {
    console.error('Failed to load transfer logs:', error)
    ElMessage.error(t('logs.fetchFailed'))
  } finally {
    loading.value = false
  }
}

const handleSizeChange = () => {
  pagination.page = 1
  fetchLogs()
}

const handleCurrentChange = () => {
  fetchLogs()
}

onMounted(() => {
  fetchLogs()
})
</script>

<style scoped>
.transfer-logs {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.stats-row {
  margin-bottom: 20px;
  padding: 4px 0 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.stat-item {
  text-align: center;
  padding: 14px;
  border-right: 1px solid var(--border-subtle);
}

.stat-item.upload {
  color: var(--primary-color);
}

.stat-item.download {
  color: var(--info-color);
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}

@media (min-width: 768px) {
  .stats-row .el-col:last-child .stat-item {
    border-right: 0;
  }
}

@media (max-width: 767px) {
  .stat-item {
    border-right: 0;
  }

  .stats-row .el-col:nth-child(odd) .stat-item {
    border-right: 1px solid var(--border-subtle);
  }

  .pagination-container {
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .pagination-container :deep(.el-pagination__jump),
  .pagination-container :deep(.el-pagination__sizes) {
    display: none;
  }
}
</style>
