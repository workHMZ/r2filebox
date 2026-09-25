<template>
  <div class="audit-logs">
    <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {{ loading ? t('common.loading') : '' }}
    </p>
    <div class="subpage-header-card">
      <div class="subpage-header">
        <div class="header-desc">
          <span class="desc-text">{{ t('logs.subtitle') }}</span>
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
            @click="refreshLogs"
          >
            {{ t('common.refresh') }}
          </ActionFeedbackButton>
        </div>
      </div>
    </div>

    <el-card v-loading="loading" :aria-busy="loading" shadow="never">

      <!-- 统计卡片 -->
      <el-row :gutter="20" class="stats-row">
        <el-col :xs="12" :md="6">
          <div class="stat-item">
            <div class="stat-value">{{ stats.totalEvents }}</div>
            <div class="stat-label">{{ t('logs.totalEvents') }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :md="6">
          <div class="stat-item upload">
            <div class="stat-value">{{ stats.completedShares }}</div>
            <div class="stat-label">{{ t('logs.completedShares') }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :md="6">
          <div class="stat-item download">
            <div class="stat-value">{{ stats.completedRetrievals }}</div>
            <div class="stat-label">{{ t('logs.completedRetrievals') }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :md="6">
          <div class="stat-item">
            <div class="stat-value">{{ stats.activeSources }}</div>
            <div class="stat-label">{{ t('logs.activeSources') }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- 日志列表 -->
      <el-table
        :data="logsList"
        :aria-busy="loading"
        table-layout="auto"
        :scrollbar-tabindex="0"
        stripe
      >
        <el-table-column
          prop="id"
          :label="t('logs.eventId')"
          min-width="290"
        >
          <template #default="{ row }">
            <code class="identifier-cell">{{ row.id }}</code>
          </template>
        </el-table-column>

        <el-table-column prop="action" :label="t('logs.operation')" min-width="170">
          <template #default="{ row }">
            <el-tag :type="getActionType(row.action)" size="small">
              {{ getActionLabel(row.action) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column
          prop="share_id"
          :label="t('logs.shareId')"
          min-width="290"
        >
          <template #default="{ row }">
            <code v-if="row.share_id" class="identifier-cell">{{ row.share_id }}</code>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column
          prop="subject_name"
          :label="t('logs.contentName')"
          min-width="160"
        >
          <template #default="{ row }">
            <span class="content-name">{{ row.subject_name || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="size_bytes" :label="t('logs.contentSize')" width="120">
          <template #default="{ row }">
            {{ formatFileSize(row.size_bytes, getLocaleTag(locale)) }}
          </template>
        </el-table-column>

        <el-table-column prop="ip_hash_prefix" :label="t('logs.ipHash')" width="150">
          <template #default="{ row }">
            {{ formatHashPrefix(row.ip_hash_prefix) }}
          </template>
        </el-table-column>

        <el-table-column prop="status" :label="t('common.status')" width="110">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" effect="plain" size="small">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="created_at" :label="t('logs.operationTime')" min-width="120">
          <template #default="{ row }">
            <div class="datetime-cell">
              <span class="datetime-date">{{ formatSplitDateTime(row.created_at).date }}</span>
              <span class="datetime-time">{{ formatSplitDateTime(row.created_at).time }}</span>
            </div>
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
import { Clock, Refresh } from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import type { AuditLog } from '@/api/admin'
import ActionFeedbackButton from '@/components/ActionFeedbackButton.vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useLastRefresh } from '@/composables/useLastRefresh'
import { getLocaleTag, useI18n } from '@/i18n'
import { formatFileSize, formatSplitDateTime } from '@/utils/format'

const loading = ref(false)
const logsList = ref<AuditLog[]>([])
const { t, locale } = useI18n()
let requestVersion = 0
const { active: refreshSucceeded, show: showRefreshSucceeded } = useActionFeedback()
const { lastRefreshTime, markRefreshed } = useLastRefresh()

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const stats = reactive({
  totalEvents: 0,
  completedShares: 0,
  completedRetrievals: 0,
  activeSources: 0
})

const getActionLabel = (action: string): string => {
  const keys: Record<string, string> = {
    admin_login: 'logs.action.adminLogin',
    admin_logout: 'logs.action.adminLogout',
    admin_update_config: 'logs.action.configUpdated',
    admin_delete_share: 'logs.action.adminDeleteShare',
    admin_cleanup_expired: 'logs.action.cleanupExpired',
    share_text_create: 'logs.action.textCreated',
    instant_file_create: 'logs.action.instantFileCreated',
    multipart_file_fingerprint_mismatch: 'logs.action.fingerprintMismatch',
    multipart_file_init: 'logs.action.fileUploadStarted',
    multipart_file_complete: 'logs.action.fileUploadCompleted',
    multipart_file_size_mismatch: 'logs.action.fileSizeMismatch',
    share_resolve_text: 'logs.action.textRetrieved',
    share_resolve_file: 'logs.action.fileAccessVerified',
    share_download_file: 'logs.action.fileDownloaded'
  }
  return keys[action] ? t(keys[action]) : action
}

type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

const getActionType = (action: string): TagType => {
  const types: Record<string, TagType> = {
    admin_login: 'warning',
    admin_logout: 'info',
    admin_update_config: 'warning',
    admin_delete_share: 'danger',
    admin_cleanup_expired: 'warning',
    share_text_create: 'success',
    instant_file_create: 'success',
    multipart_file_fingerprint_mismatch: 'danger',
    multipart_file_init: 'info',
    multipart_file_complete: 'success',
    multipart_file_size_mismatch: 'danger',
    share_resolve_text: 'primary',
    share_resolve_file: 'info',
    share_download_file: 'primary'
  }
  return types[action] || 'info'
}

const getStatusLabel = (status: string): string => {
  if (status === 'success') return t('logs.status.success')
  if (status === 'failed') return t('logs.status.failed')
  if (status === 'partial') return t('logs.status.partial')
  return status
}

const getStatusType = (status: string): TagType => {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'partial') return 'warning'
  return 'info'
}

const formatHashPrefix = (prefix: string | null): string => prefix ? `${prefix}…` : '-'

let statsLoaded = false
const fetchLogs = async (includeStats = true): Promise<boolean> => {
  const currentVersion = ++requestVersion
  loading.value = true
  try {
    const res = await adminApi.getAuditLogs({
      page: pagination.page,
      page_size: pagination.pageSize,
      include_stats: includeStats || !statsLoaded,
    })

    if (currentVersion === requestVersion && res.code === 200) {
      logsList.value = res.data.items
      pagination.total = res.data.pagination.total
      if (res.data.stats) {
        statsLoaded = true
        stats.totalEvents = res.data.stats.total
        stats.completedShares = res.data.stats.completedShares
        stats.completedRetrievals = res.data.stats.completedRetrievals
        stats.activeSources = res.data.stats.activeSources
      }
      markRefreshed()
      return true
    }
    return false
  } catch (error) {
    console.error('Failed to load audit logs:', error)
    return false
  } finally {
    if (currentVersion === requestVersion) loading.value = false
  }
}

const refreshLogs = async () => {
  if (await fetchLogs()) showRefreshSucceeded()
}

const handleSizeChange = () => {
  pagination.page = 1
  void fetchLogs(false)
}

const handleCurrentChange = () => {
  void fetchLogs(false)
}

onMounted(() => {
  fetchLogs()
})
</script>

<style scoped>
.audit-logs {
  padding: 0;
}

.stats-row {
  margin-bottom: 20px;
  padding: var(--space-3xs) 0 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.stat-item {
  text-align: center;
  padding: var(--space-sm);
  border-right: 1px solid var(--border-subtle);
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.stat-item.upload {
  color: var(--primary-color);
}

.stat-item.download {
  color: var(--info-color);
}

.stat-value {
  font-family: var(--font-code);
  font-size: var(--fs-display-sm);
  font-weight: 600;
  letter-spacing: -0.5px;
  margin-bottom: var(--space-3xs);
}

.stat-label {
  font-size: var(--fs-body-sm);
  color: var(--text-secondary);
}

.identifier-cell,
.content-name {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.identifier-cell {
  color: inherit;
  font-family: var(--font-code);
  font-size: var(--fs-caption-up);
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
    padding-bottom: var(--space-3xs);
  }

  .pagination-container :deep(.el-pagination__jump),
  .pagination-container :deep(.el-pagination__sizes) {
    display: none;
  }
}
</style>
