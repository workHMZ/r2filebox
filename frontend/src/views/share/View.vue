<template>
  <div class="pickup-page">
    <main
      id="main-content"
      class="ledger"
      tabindex="-1"
      :aria-label="t('nav.share')"
    >
      <div class="page-toolbar">
        <InterfaceControls />
      </div>
      <div class="sheet">
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
              <el-button type="primary" :icon="HomeFilled" @click="$router.push('/')">
                {{ t('common.home') }}
              </el-button>
            </template>
          </el-result>
        </div>

        <div v-else-if="shareData" class="content-section">
          <div class="pickup-header">
            <div class="logo-section">
              <AppLogo />
              <div class="logo-text">
                <h1>{{ t('shareView.header') }}</h1>
                <p>
                  {{ t('shareView.codePrefix') }}:
                  <span class="badge-code" :title="t('a11y.selectShareCode')">{{ shareCode }}</span>
                </p>
              </div>
            </div>
            <el-button class="home-btn" :icon="HomeFilled" @click="$router.push('/')">
              {{ t('common.home') }}
            </el-button>
          </div>


          <div v-if="shareData.type === 'text'" class="pickup-text">
            <div class="content-label">
              <el-icon><Document /></el-icon>
              <span>{{ t('shareView.textContent') }}</span>
            </div>
            <div class="text-box">
              <pre>{{ shareData.text }}</pre>
            </div>
            <div class="actions">
              <ActionFeedbackButton
                type="primary"
                size="large"
                :icon="CopyDocument"
                :success="textCopied"
                @click="copyText"
              >
                {{ t('shareView.copyText') }}
              </ActionFeedbackButton>
            </div>
          </div>

          <div v-else class="pickup-file">
            <el-alert v-if="downloadExpiryMessage" :title="downloadExpiryMessage" type="warning" :closable="false" show-icon />
            <div class="file-card">
              <!-- 音视频/图片流式在线预览区 -->
              <div v-if="downloadUrl && (isMediaVideo || isMediaAudio || isMediaImage) && !mediaPreviewFailed" class="media-preview-box">
                <div v-if="isMediaVideo" class="video-preview-wrapper">
                  <video
                    :src="previewUrl"
                    controls
                    preload="metadata"
                    class="preview-video"
                    @error="handleMediaPreviewError"
                  ></video>
                </div>
                <div v-else-if="isMediaAudio" class="audio-preview-wrapper">
                  <audio
                    :src="previewUrl"
                    controls
                    preload="metadata"
                    class="preview-audio"
                    @error="handleMediaPreviewError"
                  ></audio>
                </div>
                <div v-else-if="isMediaImage" class="image-preview-wrapper">
                  <el-image
                    :src="previewUrl"
                    :preview-src-list="[previewUrl]"
                    fit="contain"
                    class="preview-image"
                    loading="lazy"
                    @error="handleMediaPreviewError"
                  />
                </div>
              </div>

              <div v-else class="file-icon">
                <div class="icon-glow-ring">
                  <el-icon :size="36" aria-hidden="true"><Folder /></el-icon>
                </div>
                <p
                  v-if="mediaPreviewFailed"
                  class="preview-fallback-status"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {{ t('shareView.previewFailed') }}
                </p>
              </div>
              <div class="file-info">
                <h3 class="file-name">{{ shareData.file_name }}</h3>
                <div class="file-meta">
                  <el-tag type="info" size="large" class="meta-tag">
                    {{ formatFileSize(shareData.size_bytes, getLocaleTag(locale)) }}
                  </el-tag>
                  <!-- A reader-facing type name; the exact MIME stays on hover. -->
                  <el-tag
                    type="success"
                    size="large"
                    class="meta-tag"
                    :title="shareData.mime_type || undefined"
                  >
                    {{ t(fileTypeLabelKey(shareData.file_name || '', shareData.mime_type)) }}
                  </el-tag>
                </div>
              </div>
              <ActionFeedbackButton
                type="primary"
                size="large"
                class="download-btn"
                :icon="Download"
                :success="downloadStarted"
                :disabled="Boolean(downloadExpiryMessage)"
                @click="downloadFile"
              >
                {{ t('shareView.downloadFile') }}
              </ActionFeedbackButton>
            </div>
          </div>

          <div class="pickup-info">
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
              <div class="info-row">
                <span class="info-key">{{ t('shareView.remaining') }}</span>
                <span class="info-val">{{ remainingPickupsText }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { pickupDeadline, pickupExpiryReason } from '@/utils/pickup-expiry'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  CopyDocument,
  Document,
  Download,
  Folder,
  HomeFilled,
  Loading,
} from '@element-plus/icons-vue'
import { shareApi } from '@/api/share'
import type { ResolvedShare } from '@/api/share'
import ActionFeedbackButton from '@/components/ActionFeedbackButton.vue'
import { getLocaleTag, useI18n } from '@/i18n'
import AppLogo from '@/components/AppLogo.vue'
import InterfaceControls from '@/components/InterfaceControls.vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { fileTypeLabelKey } from '@/utils/file-type'
import { formatDateTime, formatFileSize } from '@/utils/format'

const route = useRoute()
const { locale, t } = useI18n()

const shareCode = ref('')
const loading = ref(false)
const error = ref('')
const shareData = ref<ResolvedShare | null>(null)
const mediaPreviewFailed = ref(false)
const expiryNow = ref(Date.now())
let expiryTimer: ReturnType<typeof setTimeout> | undefined
const downloadExpiryMessage = computed(() => {
  if (shareData.value?.type !== 'file') return ''
  const reason = pickupExpiryReason(shareData.value, expiryNow.value)
  return reason === 'share' ? t('shareView.shareExpired')
    : reason === 'session' ? t('shareView.sessionExpired') : ''
})
const updateExpiry = () => {
  clearTimeout(expiryTimer)
  expiryNow.value = Date.now()
  if (shareData.value?.type !== 'file') return
  const remaining = pickupDeadline(shareData.value) - expiryNow.value
  if (Number.isFinite(remaining) && remaining > 0) {
    expiryTimer = setTimeout(updateExpiry, Math.min(remaining + 1, 2_147_483_647))
  }
}
watch(shareData, updateExpiry)
useEventListener(document, 'visibilitychange', updateExpiry)
onBeforeUnmount(() => clearTimeout(expiryTimer))
let requestVersion = 0
const shareStatus = computed(() => {
  if (loading.value) return t('shareView.loading')
  if (shareData.value) return t('a11y.shareLoaded')
  return ''
})

const downloadUrl = computed(() => shareData.value?.download_url || '')
const previewUrl = computed(() => withDisposition(downloadUrl.value, 'inline'))

const isMediaVideo = computed(() => {
  const mime = (shareData.value?.mime_type || '').toLowerCase()
  return mime.startsWith('video/')
})

const isMediaAudio = computed(() => {
  const mime = (shareData.value?.mime_type || '').toLowerCase()
  return mime.startsWith('audio/')
})

const isMediaImage = computed(() => {
  const mime = (shareData.value?.mime_type || '').toLowerCase()
  return mime.startsWith('image/') && mime !== 'image/svg+xml'
})

// download_count already includes this visit, so the figure shown is what is
// left for anyone else. A reload in the same tab reuses this visit (see
// readCachedPickup) instead of spending another pickup.
const remainingPickupsText = computed(() => {
  const share = shareData.value
  if (!share || share.max_downloads === null || share.max_downloads === undefined) {
    return t('shareView.remainingUnlimited')
  }
  return t('shareView.remainingValue', {
    remaining: Math.max(0, share.max_downloads - share.download_count),
    total: share.max_downloads,
  })
})

// Every resolve spends a pickup, and a reload - including the one iOS Safari
// does on its own when it restores a discarded tab - would otherwise spend
// another and could exhaust a one-pickup share before the recipient saw it.
// sessionStorage is scoped to this tab and cleared when it closes, so a new
// tab or another device still counts as a new pickup.
const PICKUP_CACHE_PREFIX = 'r2filebox-pickup:'

const readCachedPickup = (code: string): ResolvedShare | null => {
  const key = `${PICKUP_CACHE_PREFIX}${code}`
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const cached = JSON.parse(raw) as Partial<ResolvedShare> | null
    const now = Date.now()
    const usable = cached?.code === code &&
      (cached.type === 'text' || cached.type === 'file') &&
      Date.parse(cached.expire_at || '') > now &&
      // A file is only reachable while its download session cookie lives.
      (cached.type === 'text' || Date.parse(cached.download_expires_at || '') > now)
    if (usable) return cached as ResolvedShare
    sessionStorage.removeItem(key)
  } catch {
    // Storage may be blocked; resolving again is the safe fallback.
  }
  return null
}

const cachePickup = (share: ResolvedShare) => {
  try {
    sessionStorage.setItem(`${PICKUP_CACHE_PREFIX}${share.code}`, JSON.stringify(share))
  } catch {
    // Without storage a reload simply resolves again.
  }
}

const fetchShare = async (code: string, version: number) => {
  loading.value = true
  error.value = ''
  shareData.value = null
  mediaPreviewFailed.value = false

  const cached = readCachedPickup(code)
  if (cached) {
    shareData.value = cached
    loading.value = false
    return
  }

  try {
    const res = await shareApi.getShare(code)
    if (version !== requestVersion) return

    if (res.code === 200) {
      shareData.value = res.data
      cachePickup(res.data)
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

const { active: textCopied, reset: resetTextCopyFeedback, show: showTextCopied } = useActionFeedback()
const { active: downloadStarted, reset: resetDownloadFeedback, show: showDownloadStarted } = useActionFeedback()

const copyText = async () => {
  if (!shareData.value?.text) return
  
  try {
    await navigator.clipboard.writeText(shareData.value.text)
    ElMessage.success(t('shareView.copyDone'))
    showTextCopied()
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
  // The pickup session is what authorises the download. Once it lapses the
  // endpoint can only answer 404 in a new tab, so say so here instead.
  updateExpiry()
  if (downloadExpiryMessage.value) {
    ElMessage.warning(downloadExpiryMessage.value)
    return
  }
  window.open(withDisposition(url, 'attachment'), '_blank', 'noopener,noreferrer')
  showDownloadStarted()
}

const handleMediaPreviewError = () => {
  mediaPreviewFailed.value = true
}

const withDisposition = (url: string, disposition: 'inline' | 'attachment') => {
  if (!url) return ''
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}disposition=${disposition}`
}

watch(() => route.params.code, (value) => {
  resetTextCopyFeedback()
  resetDownloadFeedback()
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
/* The root class is deliberately not called `share-page`. Ad blockers ship
   generic cosmetic filters for social share widgets that hide `.share-page`,
   `.share-box`, `.share-panel` and friends with a user-origin
   `display: none !important` — which outranks even an inline style, so the
   whole route rendered as a blank cream page for anyone running one. Keep
   route roots out of that namespace; scripts/verify-selectors.mjs enforces it. */
/* viewport-fit=cover puts the page under the status bar and the home
   indicator. The safe-area guard is written once here and the breakpoints
   only retune the variables — declaring `padding` again in a media query
   would silently drop the guard on exactly the viewports that need it. */
.pickup-page {
  --page-inset-top: var(--space-lg);
  --page-inset-bottom: var(--space-md);
  min-height: 100vh;
  min-height: 100dvh;
  padding-block: max(var(--page-inset-top), env(safe-area-inset-top, 0px))
    max(var(--page-inset-bottom), env(safe-area-inset-bottom, 0px));
  padding-inline: 0;
  overflow-x: hidden;
  /* One measure for the slip, the toolbar and the ledger that carries them,
     so they cannot drift apart again. */
  --slip-measure: 720px;
}

/* The ledger was centred but the slip inside it was not: at the shared 1040px
   measure the 720px slip sat flush against the binding edge and left a third
   of the viewport empty to its right. This route carries nothing but the slip,
   so the ledger takes the slip measure and the whole block centres as one. */
.ledger {
  display: flex;
  width: min(
    calc(100% - var(--space-lg) * 2),
    calc(var(--slip-measure) + var(--space-lg) * 2)
  );
  min-height: calc(100dvh - var(--space-xl));
  flex-direction: column;
  gap: var(--space-sm);
}

/* Aligned to the slip's measure, not the full ledger, so the controls stay
   attached to the content instead of drifting to the page edge. */
.page-toolbar {
  display: flex;
  width: 100%;
  max-width: var(--slip-measure);
  justify-content: flex-end;
}

/* A pickup slip, not a spread: the measure stays readable even though the
   ledger and its binding edge run the full page width. */
.sheet {
  display: flex;
  width: 100%;
  max-width: var(--slip-measure);
  flex: 1;
  flex-direction: column;
  gap: var(--space-md);
  padding-top: var(--space-2xs);
}

/* ---- States ------------------------------------------------------------ */
.loading-section {
  padding: var(--space-2xl) var(--space-md);
  text-align: center;
}

.loading-icon {
  color: var(--primary-ink);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.loading-section p {
  margin-top: var(--space-md);
  color: var(--text-secondary);
  font-size: var(--fs-body-md);
}

.content-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

/* ---- Masthead ---------------------------------------------------------- */
.pickup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--border-subtle);
}

.logo-section {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-xs);
}

.logo-text h1 {
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: var(--fs-display-sm);
  font-weight: 500;
  letter-spacing: var(--tracking-display);
  line-height: var(--leading-display);
}

.logo-text p {
  margin-top: var(--space-3xs);
  color: var(--text-secondary);
  font-size: var(--fs-body-sm);
  text-align: left;
}

.badge-code {
  padding: 2px var(--space-3xs);
  border-bottom: 2px solid var(--primary-color);
  color: var(--text-primary);
  cursor: pointer;
  font-family: var(--font-code);
  font-weight: 600;
  letter-spacing: 0.1em;
  user-select: all;
}

.home-btn {
  flex: 0 0 auto;
}

/* ---- Text share -------------------------------------------------------- */
.pickup-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  text-align: left;
}

.content-label {
  display: flex;
  align-items: center;
  gap: var(--space-3xs);
  color: var(--text-secondary);
  font-size: var(--fs-caption-up);
  font-weight: 600;
  letter-spacing: var(--tracking-caption-up);
  text-transform: uppercase;
}

.text-box {
  max-height: 380px;
  padding: var(--space-sm);
  overflow-y: auto;
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--primary-color);
  border-radius: var(--radius-md);
  background: var(--surface-page);
}

.text-box pre {
  color: var(--text-primary);
  font-family: var(--font-code);
  font-size: var(--fs-body-sm);
  line-height: var(--leading-body);
  white-space: pre-wrap;
  word-break: break-all;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

/* ---- Media preview ----------------------------------------------------- */
.media-preview-box {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-sm);
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--media-preview-bg);
}

.video-preview-wrapper,
.audio-preview-wrapper,
.image-preview-wrapper {
  display: flex;
  width: 100%;
  justify-content: center;
}

.preview-video {
  width: 100%;
  max-height: 420px;
  border-radius: var(--radius-md);
  background: var(--surface-dark);
}

.preview-audio {
  width: 100%;
  padding: var(--space-xs);
}

.preview-video:focus-visible,
.preview-audio:focus-visible {
  outline: 2px solid var(--primary-strong);
  outline-offset: 3px;
}

.preview-image {
  max-width: 100%;
  max-height: 400px;
  border-radius: var(--radius-md);
}

/* ---- File share -------------------------------------------------------- */
.file-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-lg) var(--space-md);
  border: 1px dashed var(--control-border);
  border-radius: var(--radius-lg);
  background: var(--surface-page);
}

.file-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.icon-glow-ring {
  display: flex;
  width: 64px;
  height: 64px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--primary-border);
  border-radius: var(--radius-md);
  color: var(--primary-ink);
}

.preview-fallback-status {
  margin-top: var(--space-xs);
  color: var(--text-secondary);
  font-size: var(--fs-body-sm);
  text-align: center;
}

.file-info {
  width: 100%;
  margin-bottom: var(--space-md);
  text-align: center;
}

.file-name {
  margin-bottom: var(--space-2xs);
  color: var(--text-primary);
  font-size: var(--fs-title-md);
  font-weight: 600;
  line-height: var(--leading-title);
  word-break: break-all;
}

.file-meta {
  display: flex;
  justify-content: center;
  gap: var(--space-2xs);
}

.meta-tag {
  padding: 2px var(--space-3xs) !important;
  font-size: var(--fs-caption-up) !important;
}

.download-btn {
  min-height: 52px;
  /* Vertical padding, not zero: the label may wrap to two lines. */
  padding: var(--space-2xs) var(--space-lg) !important;
}

/* ---- Terms ------------------------------------------------------------- */
.info-table-card {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-subtle);
}

.info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-xs);
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--border-subtle);
}

.info-key {
  color: var(--text-secondary);
  font-size: var(--fs-body-sm);
}

.info-val {
  color: var(--text-primary);
  font-size: var(--fs-body-sm);
  font-weight: 600;
  text-align: right;
}

.code-tag {
  font-family: var(--font-code) !important;
  letter-spacing: 0.1em !important;
}

.expire-time {
  color: var(--text-primary);
  font-family: var(--font-code);
}

@media (max-width: 767px) {
  .pickup-page {
    --page-inset-top: var(--space-sm);
    --page-inset-bottom: var(--space-sm);
  }

  .logo-text h1 {
    font-size: var(--fs-title-lg);
  }

  .pickup-header {
    align-items: stretch;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .home-btn {
    width: 100%;
  }

  .file-card {
    padding: var(--space-md) var(--space-sm);
  }
}
</style>
