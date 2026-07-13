<template>
  <div class="files-container">
    <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {{ loading ? t('common.loading') : '' }}
    </p>
    <el-card shadow="never" class="files-card" :aria-busy="loading">
      <div class="card-header">
        <div class="header-title">
          <h2>{{ t('files.title') }}</h2>
          <p>{{ t('files.subtitle') }}</p>
        </div>
        <el-button @click="fetchFiles" :loading="loading" class="refresh-btn">
          <el-icon><Refresh /></el-icon>
          {{ t('common.refreshData') }}
        </el-button>
      </div>

      <el-divider />

      <el-table 
        :data="filesList" 
        v-loading="loading"
        :aria-busy="loading"
        table-layout="auto"
        :scrollbar-tabindex="0"
        class="files-table"
      >
        <el-table-column :label="t('files.fileInfo')" min-width="250">
          <template #default="{ row }">
            <div class="file-info">
              <div class="file-icon">
                <el-icon size="32" :color="getFileIconColor(row)">
                  <component :is="getFileIcon(row)" />
                </el-icon>
              </div>
              <div class="file-details">
                <div class="file-name">
                  {{ row.uuid_file_name || row.code }}
                </div>
                <div class="file-code">
                  <el-tag size="small" type="info">
                    {{ row.code }}
                  </el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="size" :label="t('common.size')" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="info" effect="plain">
              {{ formatFileSize(row.size) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('files.uploadType')" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.text ? 'success' : 'primary'" effect="light">
              <el-icon><component :is="row.text ? Document : Picture" /></el-icon>
              {{ row.text ? t('common.text') : t('common.file') }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="used_count" :label="t('files.downloads')" width="100" align="center">
          <template #default="{ row }">
            <div class="download-count">
              <el-icon><Download /></el-icon>
              {{ row.used_count || 0 }}
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="CreatedAt" :label="t('files.createdAt')" width="180">
          <template #default="{ row }">
            {{ formatDate(row.CreatedAt) }}
          </template>
        </el-table-column>

        <el-table-column prop="expired_at" :label="t('files.expiredAt')" width="220">
          <template #default="{ row }">
            <div :class="['expire-time', { expired: isExpired(row.expired_at) }]">
              <span>{{ formatDate(row.expired_at) }}</span>
              <el-tag
                v-if="isExpired(row.expired_at)"
                type="danger"
                effect="plain"
                size="small"
              >
                {{ t('a11y.expired') }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="t('files.actions')" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              type="danger"
              size="small"
              @click="deleteFile(row)"
            >
              <el-icon><Delete /></el-icon>
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          background
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import type { Component } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Refresh, Document, Picture, Download, Delete,
  VideoPlay, Headset, Reading
} from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import type { AdminShare } from '@/api/admin'
import { getLocaleTag, useI18n } from '@/i18n'

const loading = ref(false)
const filesList = ref<AdminShare[]>([])
const { t, locale } = useI18n()

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
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

const isExpired = (dateStr: string): boolean => {
  if (!dateStr) return false
  try {
    return new Date(dateStr) < new Date()
  } catch {
    return false
  }
}

const getFileIcon = (row: AdminShare) => {
  const filename = row.uuid_file_name || ''
  const ext = filename.split('.').pop()?.toLowerCase()
  
  const iconMap: Record<string, Component> = {
    'jpg': Picture,
    'jpeg': Picture,
    'png': Picture,
    'gif': Picture,
    'mp4': VideoPlay,
    'mp3': Headset,
    'txt': Reading,
    'pdf': Document
  }
  
  return iconMap[ext || ''] || Document
}

const getFileIconColor = (row: AdminShare) => {
  const filename = row.uuid_file_name || ''
  const ext = filename.split('.').pop()?.toLowerCase()
  
  const colorMap: Record<string, string> = {
    'jpg': '#409eff',
    'jpeg': '#409eff',
    'png': '#409eff',
    'gif': '#409eff',
    'mp4': '#67c23a',
    'mp3': '#e6a23c',
    'txt': '#909399',
    'pdf': '#f56c6c'
  }
  
  return colorMap[ext || ''] || '#606266'
}

const fetchFiles = async () => {
  loading.value = true
  try {
    const res = await adminApi.getFiles({
      page: pagination.page,
      page_size: pagination.pageSize
    })
    
    if (res.code === 200) {
      filesList.value = res.data.list
      pagination.total = res.data.total
    }
  } catch (error) {
    console.error('Failed to load files:', error)
    ElMessage.error(t('files.fetchFailed'))
  } finally {
    loading.value = false
  }
}

const deleteFile = async (file: AdminShare) => {
  try {
    await ElMessageBox.confirm(
      t('files.deleteConfirm', { name: file.uuid_file_name || file.code }),
      t('files.deleteTitle'),
      { 
        type: 'warning',
        confirmButtonText: t('files.deleteConfirmButton'),
        cancelButtonText: t('common.cancel')
      }
    )
    
    const res = await adminApi.deleteFile(file.id)
    if (res.code === 200) {
      ElMessage.success(t('files.deleteDone'))
      await fetchFiles()
    } else {
      ElMessage.error(res.message || t('files.deleteFailed'))
    }
  } catch (error: unknown) {
    if (error !== 'cancel') {
      ElMessage.error(t('files.deleteFailed'))
    }
  }
}

const handleSizeChange = () => {
  pagination.page = 1
  fetchFiles()
}

const handleCurrentChange = () => {
  fetchFiles()
}

onMounted(() => {
  fetchFiles()
})
</script>

<style scoped>
.files-container {
  animation: fadeIn 0.28s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.files-card {
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title h2 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 740;
  color: var(--text-primary);
}

.header-title p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.refresh-btn {
  min-height: 38px;
  border-radius: var(--radius-md);
  background: var(--primary-color);
  border: 1px solid var(--primary-color);
  color: #ffffff;
  transition: background 0.18s ease, border-color 0.18s ease;
}

.refresh-btn:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}

.files-table {
  margin-top: 20px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.file-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  border-radius: var(--radius-lg);
  background: var(--surface-page);
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-details {
  flex: 1;
}

.file-name {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  font-size: 15px;
}

.file-code {
  display: flex;
  gap: 8px;
}

.download-count {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-weight: 600;
  color: var(--primary-color);
}

.expire-time {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-regular);
  white-space: nowrap;
}

.expire-time.expired {
  color: var(--danger-color);
  font-weight: 600;
}

.pagination-wrapper {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

:deep(.el-table) {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

:deep(.el-table th) {
  background: var(--surface-page) !important;
  font-weight: 600;
  color: var(--text-primary);
}

:deep(.el-table td) {
  padding: 16px 0;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td) {
  background: var(--surface-page);
}

@media (max-width: 720px) {
  .card-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }

  .refresh-btn {
    align-self: stretch;
  }

  .pagination-wrapper {
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .pagination-wrapper :deep(.el-pagination__jump),
  .pagination-wrapper :deep(.el-pagination__sizes) {
    display: none;
  }
}
</style>
