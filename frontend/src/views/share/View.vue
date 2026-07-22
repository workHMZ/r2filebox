<template>
  <div class="share-view-container">
    <div class="bg-decoration" aria-hidden="true"></div>

    <main
      id="main-content"
      class="main-wrapper"
      tabindex="-1"
      :aria-label="t('nav.share')"
    >
      <div class="page-toolbar">
        <LanguageSwitch inline />
      </div>
      <div class="glass-card">
        <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {{ shareStatus }}
        </p>

        <div v-if="loading" class="loading-section">
          <el-icon class="loading-icon" :size="60" aria-hidden="true"><Loading /></el-icon>
          <p>{{ t('shareView.loading') }}</p>
        </div>

        <div v-else-if="error" class="error-section" role="alert">
          <el-result icon="error" :title="t('shareView.invalid')" :sub-title="error">
            <template #extra>
              <el-button type="primary" @click="$router.push('/')">
                <el-icon style="margin-right: 4px;"><HomeFilled /></el-icon>
                {{ t('common.home') }}
              </el-button>
            </template>
          </el-result>
        </div>

        <div v-else-if="shareData" class="content-section">
          <div class="share-header">
            <div class="logo-section">
              <AppLogo />
              <div class="logo-text">
                <h1>{{ t('shareView.header') }}</h1>
                <p>{{ t('shareView.codePrefix') }}: <span class="badge-code">{{ shareCode }}</span></p>
              </div>
            </div>
            <el-button class="home-btn" @click="$router.push('/')">
              <el-icon><HomeFilled /></el-icon>
              {{ t('common.home') }}
            </el-button>
          </div>

          <el-divider class="glass-divider" />

          <div v-if="shareData.type === 'text'" class="text-share-content">
            <div class="content-label">
              <el-icon><Document /></el-icon>
              <span>{{ t('shareView.textContent') }}</span>
            </div>
            <div class="text-box">
              <pre>{{ shareData.text }}</pre>
            </div>
            <div class="actions">
              <el-button type="primary" size="large" @click="copyText">
                <el-icon><CopyDocument /></el-icon>
                {{ t('shareView.copyText') }}
              </el-button>
            </div>
          </div>

          <div v-else class="file-share-content">
            <div class="file-card">
              <div class="file-icon">
                <div class="icon-glow-ring">
                  <el-icon :size="36"><Folder /></el-icon>
                </div>
              </div>
              <div class="file-info">
                <h3 class="file-name">{{ shareData.file_name }}</h3>
                <div class="file-meta">
                  <el-tag type="info" size="large" class="meta-tag">
                    {{ formatFileSize(shareData.size_bytes, getLocaleTag(locale)) }}
                  </el-tag>
                </div>
              </div>
              <el-button type="primary" size="large" class="download-btn" @click="downloadFile">
                <el-icon><Download /></el-icon>
                {{ t('shareView.downloadFile') }}
              </el-button>
            </div>
          </div>

          <div class="share-info">
            <div class="info-table-card">
              <div class="info-row">
                <span class="info-key">{{ t('share.code.label') }}</span>
                <span class="info-val"><el-tag class="code-tag">{{ shareCode }}</el-tag></span>
              </div>
              <div class="info-row">
                <span class="info-key">{{ t('shareView.type') }}</span>
                <span class="info-val">
                  <span class="type-indicator" :class="shareData.type">
                    {{ shareData.type === 'text' ? t('shareView.textType') : t('shareView.fileType') }}
                  </span>
                </span>
              </div>
              <div class="info-row" v-if="shareData.expire_at">
                <span class="info-key">{{ t('shareView.expire') }}</span>
                <span class="info-val expire-time">{{ formatDateTime(shareData.expire_at, getLocaleTag(locale)) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { 
  HomeFilled, Document, Folder, Download, CopyDocument, Loading
} from '@element-plus/icons-vue'
import { shareApi } from '@/api/share'
import type { ResolvedShare } from '@/api/share'
import { getLocaleTag, useI18n } from '@/i18n'
import AppLogo from '@/components/AppLogo.vue'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import { formatDateTime, formatFileSize } from '@/utils/format'

const route = useRoute()
const { locale, t } = useI18n()

const shareCode = ref('')
const loading = ref(false)
const error = ref('')
const shareData = ref<ResolvedShare | null>(null)
let requestVersion = 0
const shareStatus = computed(() => {
  if (loading.value) return t('shareView.loading')
  if (shareData.value) return t('a11y.shareLoaded')
  return ''
})

const fetchShare = async (code: string, version: number) => {
  loading.value = true
  error.value = ''
  shareData.value = null

  try {
    const res = await shareApi.getShare(code)
    if (version !== requestVersion) return

    if (res.code === 200) {
      shareData.value = res.data
    } else {
      error.value = res.message || t('shareView.notFound')
    }
  } catch (err: unknown) {
    if (version !== requestVersion) return
    error.value = err instanceof Error ? err.message : t('shareView.networkFailed')
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

const copyText = async () => {
  if (!shareData.value?.text) return
  
  try {
    await navigator.clipboard.writeText(shareData.value.text)
    ElMessage.success(t('shareView.copyDone'))
  } catch {
    ElMessage.error(t('shareView.copyFailed'))
  }
}

const downloadFile = () => {
  if (!shareCode.value) return
  
  const url = shareData.value?.download_url
  if (!url) {
    ElMessage.error(t('shareView.networkFailed'))
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

watch(() => route.params.code, (value) => {
  const version = ++requestVersion
  const code = typeof value === 'string' ? value.trim() : ''
  if (code) {
    shareCode.value = code
    void fetchShare(code, version)
  } else {
    shareCode.value = ''
    loading.value = false
    shareData.value = null
    error.value = t('shareView.invalidCode')
  }
}, { immediate: true })
</script>

<style scoped>
.share-view-container {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
}

/* 主容器 */
.main-wrapper {
  position: relative;
  z-index: 1;
  width: min(100% - 40px, 760px);
  margin: 0 auto;
  padding: 28px 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  justify-content: center;
}

.page-toolbar {
  display: flex;
  width: 100%;
  justify-content: flex-end;
}

.glass-card {
  width: 100%;
  padding: 32px;
  border-top: 3px solid var(--primary-color);
}

/* 加载状态 */
.loading-section {
  text-align: center;
  padding: 60px 20px;
}

.loading-icon {
  animation: spin 1s linear infinite;
  color: var(--primary-color);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.loading-section p {
  margin-top: 24px;
  font-size: 16px;
  color: var(--glass-text-secondary);
  font-weight: 500;
}

/* 头部 */
.share-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
  gap: 16px;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo-text h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 760;
  color: var(--text-primary);
}

.logo-text p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--glass-text-secondary);
  text-align: left;
}

.badge-code {
  color: var(--primary-active);
  font-weight: 700;
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  padding: 1px 6px;
  border-radius: 4px;
}

.home-btn {
  background: #ffffff !important;
  border: 1px solid var(--border-subtle) !important;
  color: var(--text-primary) !important;
  border-radius: var(--radius-md);
  transition: border-color 0.18s ease, color 0.18s ease;
}

.home-btn:hover {
  background: var(--surface-page) !important;
  border-color: var(--primary-color) !important;
  color: var(--primary-color) !important;
}

.glass-divider {
  border-color: var(--border-subtle) !important;
  margin: 0 0 28px !important;
}

/* 文本提取 */
.text-share-content {
  text-align: left;
}

.content-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  font-weight: 700;
  font-size: 15px;
  color: var(--glass-text-regular);
}

.text-box {
  background: var(--surface-page);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 24px;
  margin-bottom: 24px;
  max-height: 380px;
  overflow-y: auto;
}

.text-box pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'Courier New', Courier, monospace;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary);
}

.actions {
  display: flex;
  justify-content: flex-end;
}

/* 文件提取 */
.file-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 34px 20px;
  background: var(--surface-page);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  margin-bottom: 28px;
}

.file-icon {
  margin-bottom: 20px;
}

.icon-glow-ring {
  width: 72px;
  height: 72px;
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
}

.file-info {
  text-align: center;
  margin-bottom: 28px;
  width: 100%;
}

.file-name {
  margin: 0 0 12px;
  font-size: 19px;
  font-weight: 760;
  color: var(--text-primary);
  line-height: 1.4;
  word-break: break-all;
}

.file-meta {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.meta-tag {
  font-size: 12px !important;
  padding: 2px 8px !important;
}

.download-btn {
  height: 52px;
  padding: 0 40px !important;
}

/* 分享属性信息 */
.share-info {
  margin-top: 24px;
}

.info-table-card {
  background: #ffffff;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eef2f7;
}

.info-row:last-child {
  border-bottom: none;
}

.info-key {
  font-size: 13px;
  color: var(--glass-text-secondary);
  font-weight: 500;
}

.info-val {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 600;
}

.code-tag {
  background: var(--primary-soft) !important;
  border-color: var(--primary-border) !important;
  color: var(--primary-active) !important;
}

.type-indicator {
  font-size: 12px;
}

.expire-time {
  color: var(--warning-color);
  font-family: var(--font-accent);
}

/* 响应式 */
@media (max-width: 768px) {
  .main-wrapper {
    width: min(100% - 24px, 760px);
    padding: 16px 0;
  }

  .glass-card {
    padding: 24px 16px;
  }

  .share-header {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }
  
  .home-btn {
    width: 100%;
  }

  .file-card {
    padding: 28px 16px;
  }
  
  .info-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  
  .info-val {
    align-self: flex-end;
  }
}
</style>
