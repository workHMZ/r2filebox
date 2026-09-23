<template>
  <div class="files-container">
    <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {{ loading ? t('common.loading') : '' }}
    </p>
    <div class="subpage-header-card">
      <div class="subpage-header">
        <div class="header-desc">
          <span class="desc-text">{{ t('files.subtitle') }}</span>
          <span class="desc-divider" aria-hidden="true">·</span>
          <div class="desc-meta">
            <el-icon aria-hidden="true"><Clock /></el-icon>
            <span>{{ t('common.lastRefresh', { time: lastRefreshTime }) }}</span>
          </div>
        </div>
        <div class="header-actions">
          <ActionFeedbackButton
            type="primary"
            size="small"
            :icon="Refresh"
            :loading="loading"
            :success="refreshSucceeded"
            @click="refreshFiles"
          >
            {{ t('common.refreshData') }}
          </ActionFeedbackButton>
        </div>
      </div>
    </div>

    <el-card shadow="never" class="files-card" :aria-busy="loading">

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
                <div class="record-id">
                  <span class="record-id-label">{{ t('files.shareId') }}</span>
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
              <el-icon><component :is="row.type === 'text' ? Document : Files" /></el-icon>
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

        <el-table-column prop="created_at" :label="t('files.createdAt')" min-width="120">
          <template #default="{ row }">
            <div class="datetime-cell">
              <span class="datetime-date">{{ formatSplitDateTime(row.created_at).date }}</span>
              <span class="datetime-time">{{ formatSplitDateTime(row.created_at).time }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="expire_at" :label="t('files.expiredAt')" min-width="130">
          <template #default="{ row }">
            <div :class="['expire-time', { expired: isExpired(row.expire_at) }]">
              <div class="datetime-cell">
                <span class="datetime-date">{{ formatSplitDateTime(row.expire_at).date }}</span>
                <span class="datetime-time">{{ formatSplitDateTime(row.expire_at).time }}</span>
              </div>
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
              :success="deletedFileId === row.id && deleteSucceeded"
              :aria-label="t('common.delete')"
              :title="t('common.delete')"
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
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
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
import type { Component } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Clock, Refresh, Document, Picture, Download, Delete,
  VideoPlay, Headset, Files
} from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import type { AdminShare } from '@/api/admin'
import ActionFeedbackButton from '@/components/ActionFeedbackButton.vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useLastRefresh } from '@/composables/useLastRefresh'
import { getLocaleTag, useI18n } from '@/i18n'
import { formatFileSize, formatSplitDateTime } from '@/utils/format'
import { pageAfterRemoval } from '@/utils/pagination'
import { classifyFile, type FileCategory } from '@/utils/file-type'

const loading = ref(false)
const filesList = ref<AdminShare[]>([])
const { t, locale } = useI18n()
let requestVersion = 0
const deletingFileId = ref('')
const deletedFileId = ref('')
const { active: refreshSucceeded, show: showRefreshSucceeded } = useActionFeedback()
const { lastRefreshTime, markRefreshed } = useLastRefresh()
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


const isExpired = (dateStr: string): boolean => {
  if (!dateStr) return false
  try {
    return new Date(dateStr) < new Date()
  } catch {
    return false
  }
}

const iconByCategory: Record<FileCategory, Component> = {
  image: Picture,
  video: VideoPlay,
  audio: Headset,
  document: Document,
  archive: Files,
  other: Document,
}
const colorByCategory: Record<FileCategory, string> = {
  image: 'var(--info-color)',
  video: 'var(--success-color)',
  audio: 'var(--warning-color)',
  document: 'var(--text-secondary)',
  archive: 'var(--warning-color)',
  other: 'var(--text-regular)',
}
const getFileCategory = (row: AdminShare): FileCategory => (
  classifyFile(row.display_name || '', row.mime_type)
)
const getFileIcon = (row: AdminShare) => iconByCategory[getFileCategory(row)]
const getFileIconColor = (row: AdminShare) => colorByCategory[getFileCategory(row)]

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
      markRefreshed()
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
      pagination.page = pageAfterRemoval(pagination.page, pagination.total, pagination.pageSize)
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
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

/* The page name lives once, in the admin header bar. This carries only the
   line that bar has no room for. */
.card-lead {
  min-width: 0;
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-body-sm);
}



.files-table {
  width: 100%;
}

.file-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
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
  margin-bottom: var(--space-2xs);
  font-size: var(--fs-body-sm);
}

.record-id {
  display: flex;
  align-items: center;
  min-width: 0;
  flex-wrap: wrap;
  gap: var(--space-2xs);
}

.record-id :deep(.el-tag) {
  max-width: 100%;
  height: auto;
  font-family: var(--font-code);
  font-weight: 600;
  letter-spacing: 0.5px;
}

.record-id :deep(.el-tag__content) {
  overflow-wrap: anywhere;
  white-space: normal;
}

.record-id-label {
  color: var(--text-secondary);
  font-size: var(--fs-caption-up);
}

.download-count {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3xs);
  font-family: var(--font-code);
  font-weight: 600;
  color: var(--primary-color);
}

.expire-time {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  color: var(--text-regular);
  white-space: nowrap;
}

.expire-time.expired {
  color: var(--danger-ink);
  font-weight: 600;
}

.pagination-wrapper {
  margin-top: var(--space-md);
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
  padding: var(--space-sm) 0;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td) {
  background: var(--surface-page);
}

@media (max-width: 767px) {
  .pagination-wrapper {
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: var(--space-3xs);
  }

  .pagination-wrapper :deep(.el-pagination__jump),
  .pagination-wrapper :deep(.el-pagination__sizes) {
    display: none;
  }
}
</style>
