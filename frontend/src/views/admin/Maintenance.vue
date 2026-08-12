<template>
  <div class="maintenance-tools">
    <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {{ loadingSystemInfo ? t('common.loading') : '' }}
    </p>
    <el-row :gutter="20" class="status-row" :aria-busy="loadingSystemInfo">
      <el-col :xs="24" :sm="8">
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

      <el-col :xs="24" :sm="8">
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

      <el-col :xs="24" :sm="8">
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
      <el-col :xs="24" :lg="8">
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
              <ActionFeedbackButton
                type="danger"
                :icon="Delete"
                :loading="cleaningExpired"
                :success="cleanupSucceeded"
                @click="cleanExpiredFiles"
              >
                {{ t('common.execute') }}
              </ActionFeedbackButton>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="16">
        <el-card class="tool-card" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon><DocumentChecked /></el-icon>
              <span>{{ t('maintenance.systemInfo') }}</span>
            </div>
          </template>

          <el-descriptions :column="isMobile ? 1 : 2" border>
            <el-descriptions-item :label="t('common.runtime')">
              {{ systemInfo.runtime }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('common.platform')">
              {{ systemInfo.platform }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('storage.dataLayer')">
              {{ systemInfo.storage }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('maintenance.appVersion')">
              <el-tag type="primary" size="small">v{{ versionInfo.version }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="t('maintenance.gitCommit')">
              <el-tag type="info" size="small" class="code-font" :title="versionInfo.commit_hash">
                {{ versionInfo.short_hash }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="t('maintenance.buildTime')">
              {{ versionInfo.build_time ? formatDateTime(versionInfo.build_time, getLocaleTag(locale)) : '—' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="storage-card" shadow="never" :aria-busy="loadingSystemInfo">
      <template #header>
        <div class="card-header">
          <el-icon><Folder /></el-icon>
          <span>{{ t('storage.title') }}</span>
        </div>
      </template>

      <el-descriptions :column="isMobile ? 1 : 2" border>
        <el-descriptions-item :label="t('storage.r2BucketName')">
          <code class="resource-name">{{ systemInfo.r2BucketName }}</code>
        </el-descriptions-item>
        <el-descriptions-item :label="t('storage.d1DatabaseName')">
          <code class="resource-name">{{ systemInfo.d1DatabaseName }}</code>
        </el-descriptions-item>
      </el-descriptions>

      <el-divider />

      <section class="architecture-section" aria-labelledby="storage-architecture-title">
        <div class="section-heading">
          <h3 id="storage-architecture-title">{{ t('storage.architectureTitle') }}</h3>
          <p>{{ t('storage.architectureSubtitle') }}</p>
        </div>

        <div class="architecture-grid">
          <article class="architecture-card architecture-card--r2">
            <el-icon class="architecture-icon"><Folder /></el-icon>
            <div>
              <div class="architecture-title">
                <h4>Cloudflare R2</h4>
                <el-tag size="small" type="success">{{ t('storage.r2Role') }}</el-tag>
              </div>
              <p>{{ t('storage.r2Description') }}</p>
            </div>
          </article>

          <article class="architecture-card architecture-card--d1">
            <el-icon class="architecture-icon"><Coin /></el-icon>
            <div>
              <div class="architecture-title">
                <h4>Cloudflare D1</h4>
                <el-tag size="small" type="primary">{{ t('storage.d1Role') }}</el-tag>
              </div>
              <p>{{ t('storage.d1Description') }}</p>
            </div>
          </article>

          <article class="architecture-card architecture-card--worker">
            <el-icon class="architecture-icon"><Monitor /></el-icon>
            <div>
              <div class="architecture-title">
                <h4>Cloudflare Workers</h4>
                <el-tag size="small" type="warning">{{ t('storage.workerRole') }}</el-tag>
              </div>
              <p>{{ t('storage.workerDescription') }}</p>
            </div>
          </article>

          <article class="architecture-card architecture-card--analytics">
            <el-icon class="architecture-icon"><TrendCharts /></el-icon>
            <div>
              <div class="architecture-title">
                <h4>Analytics Engine</h4>
                <el-tag size="small" type="info">{{ t('storage.analyticsRole') }}</el-tag>
              </div>
              <p>{{ t('storage.analyticsDescription') }}</p>
            </div>
          </article>
        </div>
      </section>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheckFilled,
  Files,
  Folder,
  Coin,
  Monitor,
  TrendCharts,
  Delete,
  DocumentChecked
} from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { publicApi, type VersionInfo } from '@/api/public'
import ActionFeedbackButton from '@/components/ActionFeedbackButton.vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { getLocaleTag, useI18n } from '@/i18n'
import { formatDateTime, formatFileSize } from '@/utils/format'

const cleaningExpired = ref(false)
const loadingSystemInfo = ref(false)
const isMobile = useMediaQuery('(max-width: 767px)')
const { locale, t } = useI18n()
const { active: cleanupSucceeded, show: showCleanupSucceeded } = useActionFeedback()

const versionInfo = ref<VersionInfo>({
  version: '2.3',
  commit_hash: 'dev',
  short_hash: 'dev',
  build_time: null,
})

const systemInfo = reactive({
  runtime: '-',
  platform: '-',
  storage: '-',
  r2BucketName: '-',
  d1DatabaseName: '-',
  totalFiles: 0,
  totalSize: 0
})

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
      await fetchSystemInfo()
      showCleanupSucceeded()
      ElMessage.success(t('maintenance.cleanDone', { count: res.data.deleted_count || 0 }))
    } else {
      ElMessage.error(res.message || t('maintenance.cleanFailed'))
    }
  } catch (error: unknown) {
    if (error !== 'cancel') {
      console.error('Failed to clean expired files:', error)
    }
  } finally {
    cleaningExpired.value = false
  }
}

const fetchSystemInfo = async () => {
  loadingSystemInfo.value = true
  try {
    const [infoResult, statsResult, versionResult] = await Promise.allSettled([
      adminApi.getSystemInfo(),
      adminApi.getStats(),
      publicApi.getVersion(),
    ])

    if (infoResult.status === 'fulfilled') {
      const infoRes = infoResult.value
      if (infoRes.code === 200 && infoRes.data) {
        systemInfo.runtime = infoRes.data.runtime || '-'
        systemInfo.platform = infoRes.data.platform || '-'
        systemInfo.storage = infoRes.data.storage || '-'
        systemInfo.r2BucketName = infoRes.data.r2_bucket_name || '-'
        systemInfo.d1DatabaseName = infoRes.data.d1_database_name || '-'
      }
    } else {
      console.error('Failed to load maintenance system details:', infoResult.reason)
    }

    if (statsResult.status === 'fulfilled') {
      const statsRes = statsResult.value
      if (statsRes.code === 200 && statsRes.data) {
        systemInfo.totalFiles = statsRes.data.total_files || 0
        systemInfo.totalSize = statsRes.data.total_size || 0
      }
    } else {
      console.error('Failed to load maintenance storage totals:', statsResult.reason)
    }

    if (versionResult.status === 'fulfilled') {
      const versionRes = versionResult.value
      if (versionRes.code === 200 && versionRes.data) {
        versionInfo.value = versionRes.data
      }
    } else {
      console.error('Failed to load deployment metadata:', versionResult.reason)
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

.status-icon--success { background: var(--success-soft); color: var(--success-color); }
.status-icon--warning { background: var(--warning-soft); color: var(--warning-color); }
.status-icon--danger { background: var(--danger-soft); color: var(--danger-color); }

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

.storage-card {
  margin-bottom: 20px;
}

.code-font {
  font-family: 'Courier New', Courier, monospace;
  font-weight: 700;
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

.resource-name {
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.architecture-section {
  padding-top: 2px;
}

.section-heading {
  margin-bottom: 18px;
}

.section-heading h3 {
  margin: 0 0 6px;
  color: var(--text-primary);
  font-size: 17px;
}

.section-heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.architecture-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.architecture-card {
  display: flex;
  min-width: 0;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--surface-page);
}

.architecture-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  padding: 10px;
  border-radius: 12px;
  font-size: 22px;
}

.architecture-card--r2 .architecture-icon {
  color: var(--success-color);
  background: var(--success-soft);
}

.architecture-card--d1 .architecture-icon {
  color: var(--primary-color);
  background: var(--primary-soft);
}

.architecture-card--worker .architecture-icon {
  color: var(--warning-color);
  background: var(--warning-soft);
}

.architecture-card--analytics .architecture-icon {
  color: var(--info-color);
  background: var(--info-soft);
}

.architecture-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
}

.architecture-title h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
}

.architecture-card p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
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

  .architecture-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .architecture-card {
    padding: 15px;
  }
}
</style>
