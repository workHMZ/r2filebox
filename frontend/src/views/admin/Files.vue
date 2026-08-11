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
        <ActionFeedbackButton
          type="primary"
          class="refresh-btn"
          :icon="Refresh"
          :loading="loading"
          :success="refreshSucceeded"
          @click="refreshFiles"
        >
          {{ t('common.refreshData') }}
        </ActionFeedbackButton>
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
                  {{ row.display_name || row.id }}
                </div>
                <div class="share-id">
                  <span class="share-id-label">{{ t('files.shareId') }}</span>
                  <el-tag size="small" type="info">
                    {{ row.id }}
                  </el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="size_bytes" :label="t('common.size')" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="info" effect="plain">
              {{ formatFileSize(row.size_bytes, getLocaleTag(locale)) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('files.uploadType')" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.type === 'text' ? 'success' : 'primary'" effect="light">
              <el-icon><component :is="row.type === 'text' ? Document : Picture" /></el-icon>
              {{ row.type === 'text' ? t('common.text') : t('common.file') }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="download_count" :label="t('files.downloads')" width="100" align="center">
          <template #default="{ row }">
            <div class="download-count">
              <el-icon><Download /></el-icon>
              {{ row.download_count || 0 }}
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="created_at" :label="t('files.createdAt')" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>

        <el-table-column prop="expire_at" :label="t('files.expiredAt')" width="220">
          <template #default="{ row }">
            <div :class="['expire-time', { expired: isExpired(row.expire_at) }]">
              <span>{{ formatDate(row.expire_at) }}</span>
              <el-tag
                v-if="isExpired(row.expire_at)"
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
            <ActionFeedbackButton
              type="danger"
              size="small"
              :icon="Delete"
              :loading="deletingFileId === row.id"
              :success="deleteSucceeded && deletedFileId === row.id"
              :disabled="Boolean(deletingFileId) && deletingFileId !== row.id"
              @click="deleteFile(row)"
            >
              {{ t('common.delete') }}
            </ActionFeedbackButton>
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
import ActionFeedbackButton from '@/components/ActionFeedbackButton.vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { getLocaleTag, useI18n } from '@/i18n'
import { formatDateTime, formatFileSize } from '@/utils/format'

const loading = ref(false)
const filesList = ref<AdminShare[]>([])
const { t, locale } = useI18n()
let requestVersion = 0
const deletingFileId = ref('')
const deletedFileId = ref('')
const { active: refreshSucceeded, show: showRefreshSucceeded } = useActionFeedback()
const {
  active: deleteSucceeded,
  reset: resetDeleteSucceeded,
  show: showDeleteSucceeded,
} = useActionFeedback()

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const formatDate = (dateStr: string): string => {
  return formatDateTime(dateStr, getLocaleTag(locale.value))
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
  const filename = row.display_name || ''
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
  const filename = row.display_name || ''
  const ext = filename.split('.').pop()?.toLowerCase()
  
  const colorMap: Record<string, string> = {
    'jpg': 'var(--info-color)',
    'jpeg': 'var(--info-color)',
    'png': 'var(--info-color)',
    'gif': 'var(--info-color)',
    'mp4': 'var(--success-color)',
    'mp3': 'var(--warning-color)',
    'txt': 'var(--text-secondary)',
    'pdf': 'var(--danger-color)'
  }
  
  return colorMap[ext || ''] || 'var(--text-regular)'
}

const fetchFiles = async (): Promise<boolean> => {
  const currentVersion = ++requestVersion
  loading.value = true
  try {
    const res = await adminApi.getFiles({
      page: pagination.page,
      page_size: pagination.pageSize
    })
    
    if (currentVersion === requestVersion && res.code === 200) {
      filesList.value = res.data.items
      pagination.total = res.data.total
      return true
    }
    return false
  } catch (error) {
    console.error('Failed to load files:', error)
    return false
  } finally {
    if (currentVersion === requestVersion) loading.value = false
  }
}

const refreshFiles = async () => {
  if (await fetchFiles()) showRefreshSucceeded()
}

const deleteFile = async (file: AdminShare) => {
  try {
    await ElMessageBox.confirm(
      t('files.deleteConfirm', { name: file.display_name || file.id }),
      t('files.deleteTitle'),
      { 
        type: 'warning',
        confirmButtonText: t('files.deleteConfirmButton'),
        cancelButtonText: t('common.cancel')
      }
    )
    
    deletingFileId.value = file.id
    const res = await adminApi.deleteFile(file.id)
    if (res.code === 200) {
      ElMessage.success(t('files.deleteDone'))
      deletedFileId.value = file.id
      showDeleteSucceeded()
      await new Promise((resolve) => setTimeout(resolve, 450))
      await fetchFiles()
      resetDeleteSucceeded()
      deletedFileId.value = ''
    } else {
      ElMessage.error(res.message || t('files.deleteFailed'))
    }
  } catch (error: unknown) {
    if (error !== 'cancel') {
      console.error('Failed to delete file:', error)
    }
  } finally {
    deletingFileId.value = ''
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
  min-width: 0;
}

.file-name {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  font-size: 15px;
}

.share-id {
  display: flex;
  align-items: center;
  min-width: 0;
  flex-wrap: wrap;
  gap: 8px;
}

.share-id :deep(.el-tag) {
  max-width: 100%;
  height: auto;
}

.share-id :deep(.el-tag__content) {
  overflow-wrap: anywhere;
  white-space: normal;
}

.share-id-label {
  color: var(--text-secondary);
  font-size: 12px;
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
