<template>
  <form class="file-upload-container" @submit.prevent="handleUpload">
    <el-upload
      ref="uploadRef"
      :auto-upload="false"
      :on-change="handleFileChange"
      :show-file-list="false"
      :disabled="uploading || fingerprinting"
      drag
      class="upload-dragger"
    >
      <div class="upload-content">
        <div class="upload-icon-wrapper">
          <el-icon size="30" aria-hidden="true"><UploadFilled /></el-icon>
        </div>
        <div class="upload-text">
          <h3>{{ t('upload.drop.title') }}</h3>
          <p>{{ t('upload.drop.browse') }}</p>
        </div>
        <div class="upload-hint">
          <el-icon aria-hidden="true"><InfoFilled /></el-icon>
          {{ uploadLimitText }}
        </div>
      </div>
    </el-upload>

    <transition name="fade">
      <div v-if="selectedFile" class="selected-file">
        <div class="file-preview-card">
          <div class="file-icon-box">
            <el-icon size="32" aria-hidden="true"><Document /></el-icon>
          </div>
          <div class="file-info-details">
            <div class="file-name">{{ selectedFile.name }}</div>
            <div class="file-meta">
              <span class="file-size">{{ formatFileSize(selectedFile.size, getLocaleTag(locale)) }}</span>
              <span class="file-type-badge">{{ getFileType(selectedFile.name) }}</span>
            </div>
          </div>
          <el-button 
            type="danger" 
            circle 
            size="small"
            class="clear-file-btn"
            :aria-label="t('a11y.clearSelectedFile')"
            :title="t('a11y.clearSelectedFile')"
            :disabled="uploading"
            @click.stop="clearFile"
          >
            <el-icon aria-hidden="true"><Close /></el-icon>
          </el-button>
        </div>
      </div>
    </transition>

    <ShareSettings
      id-prefix="file-share"
      v-model:expire-value="form.expire_value"
      v-model:expire-style="form.expire_style"
      :max-expire-hours="maxExpireHours"
      :expire-styles="configStore.config?.expireStyle"
    />

    <TurnstileWidget
      v-if="requiresTurnstile && !hasResumableUpload"
      ref="turnstileRef"
      :site-key="turnstileSiteKey"
      action="file-share"
      @verify="turnstileToken = $event"
    />

    <div class="upload-actions">
      <el-button
        type="primary"
        size="large"
        native-type="submit"
        class="upload-btn"
        :loading="uploading || fingerprinting"
        :aria-busy="uploading || fingerprinting"
        :disabled="!selectedFile || !selectedFingerprint || fingerprinting || (requiresTurnstile && !hasResumableUpload && !turnstileToken)"
      >
        <template #icon>
          <el-icon v-if="!uploading && !fingerprinting" aria-hidden="true"><Upload /></el-icon>
        </template>
        {{ uploading ? t('upload.uploading') : fingerprinting ? t('upload.prepare') : t('upload.start') }}
      </el-button>
      <el-button
        v-if="uploading"
        type="danger"
        size="large"
        plain
        class="cancel-upload-btn"
        @click="cancelUpload"
      >
        {{ t('upload.cancel') }}
      </el-button>
    </div>

    <transition name="fade">
      <div v-if="uploading" class="upload-progress-box">
        <el-progress 
          :percentage="uploadProgress" 
          :stroke-width="6"
          :show-text="true"
          :aria-label="t('a11y.uploadProgress')"
        />
        <p class="progress-status-text" role="status" aria-live="polite" aria-atomic="true">
          {{ uploadStatusText }}
        </p>
      </div>
    </transition>

    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ uploadAnnouncement }}
    </p>
  </form>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { shareApi, UploadPartError } from '@/api/share'
import { isAxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import { UploadFilled, Document, InfoFilled, Close, Upload } from '@element-plus/icons-vue'
import type { UploadFile, UploadInstance } from 'element-plus'
import { getLocaleTag, useI18n } from '@/i18n'
import { useConfigStore } from '@/stores/config'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import ShareSettings from '@/components/upload/ShareSettings.vue'
import { expireSelectionFromHours, type ExpireStyle } from '@/utils/expiration'
import { formatFileSize } from '@/utils/format'

const emit = defineEmits<{
  success: [result: { code: string; share_url: string; full_share_url: string; qr_code_data: string }]
}>()

const { locale, t } = useI18n()
const configStore = useConfigStore()
const BYTES_PER_MB = 1024 * 1024

type UploadedPart = {
  partNumber: number
  etag: string
  sha256: string
}

type UploadState = {
  fingerprint: string
  uploadToken: string
  code: string
  partSize: number
  partCount: number
  parts: UploadedPart[]
  fileName: string
  fileSize: number
  fileLastModified: number
  createdAt: number
}

const UPLOAD_STATE_PREFIX = 'r2filebox-upload:'
const UPLOAD_STATE_MAX_AGE = 24 * 60 * 60 * 1000
const FINGERPRINT_SAMPLE_SIZE = 64 * 1024

const selectedFile = ref<File | null>(null)
const uploadRef = ref<UploadInstance | null>(null)
const selectedFingerprint = ref('')
const resumableState = ref<UploadState | null>(null)
const fingerprinting = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadStatusText = ref('')
const uploadAnnouncement = ref('')
const turnstileToken = ref('')
const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)
let selectionVersion = 0
let uploadController: AbortController | null = null

const requiresTurnstile = computed(() => configStore.config?.requireTurnstile === true)
const turnstileSiteKey = computed(() => configStore.config?.turnstileSiteKey || '')
const maxUploadBytes = computed(() => {
  const config = configStore.config
  if (!config) return null
  return config.maxUploadBytes > 0 ? config.maxUploadBytes : null
})
const uploadLimitText = computed(() => {
  if (maxUploadBytes.value === null) {
    return t(configStore.loadFailed ? 'upload.hintUnavailable' : 'upload.hintLoading')
  }
  const size = new Intl.NumberFormat(getLocaleTag(locale.value), {
    maximumFractionDigits: 2,
  }).format(maxUploadBytes.value / BYTES_PER_MB)
  return t('upload.hint', { size: `${size} MB` })
})
const hasResumableUpload = computed(() => Boolean(resumableState.value))
const maxExpireHours = computed(() => configStore.config?.maxExpireHours ?? 168)

const initialExpire = expireSelectionFromHours(configStore.config?.defaultExpireHours ?? 24)
const form = ref<{ expire_value: number; expire_style: ExpireStyle }>({
  expire_value: initialExpire.value,
  expire_style: initialExpire.style,
})

const handleFileChange = async (file: UploadFile) => {
  if (uploading.value) return
  const currentVersion = ++selectionVersion
  selectedFile.value = file.raw || null
  selectedFingerprint.value = ''
  resumableState.value = null
  const selected = selectedFile.value
  if (selected) {
    const fileAnnouncement = t('a11y.fileSelected', {
      name: selected.name,
      size: formatFileSize(selected.size, getLocaleTag(locale.value)),
    })
    uploadAnnouncement.value = fileAnnouncement
    fingerprinting.value = true
    try {
      const fingerprint = await getFileFingerprint(selected)
      if (currentVersion !== selectionVersion || selectedFile.value !== selected) return
      selectedFingerprint.value = fingerprint
      const savedState = loadUploadState(fingerprint, selected)
      resumableState.value = savedState && await verifySavedParts(savedState, selected)
        ? savedState
        : null
      if (savedState && !resumableState.value) removeUploadState(fingerprint)
      if (resumableState.value) {
        uploadStatusText.value = t('upload.resumeDetected')
        uploadAnnouncement.value = `${fileAnnouncement} ${t('upload.resumeDetected')}`
      }
    } catch (error) {
      if (currentVersion === selectionVersion) {
        console.error('Failed to fingerprint selected file:', error)
        ElMessage.error(t('upload.fingerprintFailed'))
      }
    } finally {
      if (currentVersion === selectionVersion) fingerprinting.value = false
    }
  }
}

const clearFile = () => {
  if (uploading.value) return
  selectionVersion++
  selectedFile.value = null
  selectedFingerprint.value = ''
  resumableState.value = null
  fingerprinting.value = false
  uploadRef.value?.clearFiles()
  uploadAnnouncement.value = t('a11y.fileCleared')
}

const getFileType = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const typeMap: Record<string, string> = {
    'jpg': t('fileType.image'),
    'jpeg': t('fileType.image'),
    'png': t('fileType.image'),
    'gif': t('fileType.image'),
    'pdf': t('fileType.pdf'),
    'doc': t('fileType.word'),
    'docx': t('fileType.word'),
    'xls': t('fileType.excel'),
    'xlsx': t('fileType.excel'),
    'zip': t('fileType.archive'),
    'rar': t('fileType.archive'),
    'mp4': t('fileType.video'),
    'mp3': t('fileType.audio')
  }
  return typeMap[ext] || t('fileType.unknown')
}

const handleUpload = async () => {
  const file = selectedFile.value
  if (!file) {
    ElMessage.warning(t('upload.selectFirst'))
    return
  }

  await configStore.fetchConfig()
  const fingerprint = selectedFingerprint.value || await getFileFingerprint(file)
  if (selectedFile.value !== file) return
  selectedFingerprint.value = fingerprint
  let state = resumableState.value
  if (!state && requiresTurnstile.value && !turnstileToken.value) {
    ElMessage.warning(t('turnstile.required'))
    return
  }

  uploading.value = true
  uploadProgress.value = 0
  uploadStatusText.value = t('upload.prepare')
  const controller = new AbortController()
  uploadController = controller

  try {
    if (state) {
      uploadStatusText.value = t('upload.resume')
    } else {
      const initRes = await shareApi.initFileUpload({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        turnstileToken: turnstileToken.value || undefined,
        ...form.value,
      }, controller.signal)

      if (initRes.code !== 200) {
        throw new Error(initRes.message || t('upload.initFailed'))
      }

      state = {
        fingerprint,
        uploadToken: initRes.data.uploadToken,
        code: initRes.data.code,
        partSize: initRes.data.partSize,
        partCount: initRes.data.partCount,
        parts: [],
        fileName: file.name,
        fileSize: file.size,
        fileLastModified: file.lastModified,
        createdAt: Date.now(),
      }
      saveUploadState(state)
      resumableState.value = state
    }

    for (let index = 0; index < state.partCount; index++) {
      const partNumber = index + 1
      if (state.parts.some((part) => part.partNumber === partNumber)) {
        updateProgress(state)
        continue
      }

      const start = index * state.partSize
      const end = Math.min(start + state.partSize, file.size)
      uploadStatusText.value = t('upload.part', { current: partNumber, total: state.partCount })
      const chunk = file.slice(start, end)
      const [part, sha256] = await Promise.all([
        uploadPartWithRetry(
          state.uploadToken,
          partNumber,
          chunk,
          controller.signal,
        ),
        sha256Blob(chunk),
      ])
      state.parts.push({ ...part, sha256 })
      state.parts.sort((a, b) => a.partNumber - b.partNumber)
      saveUploadState(state)
      resumableState.value = state
      updateProgress(state)
    }

    uploadStatusText.value = t('upload.complete')
    const res = await shareApi.completeFileUpload({
      uploadToken: state.uploadToken,
      code: state.code,
      parts: state.parts,
    }, controller.signal)

    if (res.code !== 200) {
      throw new Error(res.message || t('upload.mergeFailed'))
    }

    removeUploadState(state.fingerprint)
    resumableState.value = null
    turnstileRef.value?.reset()
    uploadProgress.value = 100
    uploadStatusText.value = t('upload.successStatus')
    uploadAnnouncement.value = t('upload.successStatus')
    ElMessage.success(t('upload.done'))
    
    emit('success', {
      code: res.data.code,
      share_url: res.data.share_url,
      full_share_url: res.data.full_share_url,
      qr_code_data: res.data.qr_code_data,
    })

    uploading.value = false
    selectedFile.value = null
    selectedFingerprint.value = ''
    uploadRef.value?.clearFiles()
    uploadProgress.value = 0
  } catch (error: unknown) {
    turnstileRef.value?.reset()
    if (controller.signal.aborted || isAbortError(error)) {
      uploadStatusText.value = t('upload.cancelled')
      uploadAnnouncement.value = t('upload.cancelled')
      ElMessage.info(t('upload.cancelled'))
      uploading.value = false
      return
    }
    if (state && isTerminalUploadError(error)) {
      removeUploadState(state.fingerprint)
      resumableState.value = null
    }
    const errorMessage = error instanceof Error ? error.message : t('upload.failed')
    ElMessage.error(errorMessage)
    uploading.value = false
  } finally {
    uploadController = null
  }
}

const uploadPartWithRetry = async (
  uploadToken: string,
  partNumber: number,
  chunk: Blob,
  signal: AbortSignal,
): Promise<Omit<UploadedPart, 'sha256'>> => {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await shareApi.uploadFilePart(uploadToken, partNumber, chunk, signal)
      return res.data
    } catch (error) {
      lastError = error
      if (signal.aborted || !shouldRetryPart(error) || attempt === 3) break
      uploadStatusText.value = t('upload.retry', { part: partNumber, attempt })
      const delay = error instanceof UploadPartError && error.retryAfterMs !== null
        ? error.retryAfterMs
        : 500 * attempt
      await sleep(delay, signal)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(t('upload.failed'))
}

const updateProgress = (state: UploadState) => {
  uploadProgress.value = Math.min(95, Math.floor((state.parts.length / state.partCount) * 95))
}

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const onAbort = () => {
    window.clearTimeout(timer)
    reject(new DOMException('Upload cancelled', 'AbortError'))
  }
  const timer = window.setTimeout(() => {
    signal.removeEventListener('abort', onAbort)
    resolve()
  }, ms)
  signal.addEventListener('abort', onAbort, { once: true })
})

const shouldRetryPart = (error: unknown) => {
  if (error instanceof UploadPartError) return error.status === 429 || error.status >= 500
  return error instanceof TypeError
}

const isTerminalUploadError = (error: unknown) => {
  const status = error instanceof UploadPartError
    ? error.status
    : isAxiosError(error)
      ? error.response?.status
      : undefined
  return status !== undefined && [400, 401, 404, 410, 413].includes(status)
}

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

const getFileFingerprint = async (file: File): Promise<string> => {
  const sampleOffsets = [
    0,
    Math.max(0, Math.floor((file.size - FINGERPRINT_SAMPLE_SIZE) / 2)),
    Math.max(0, file.size - FINGERPRINT_SAMPLE_SIZE),
  ]
  const samples = await Promise.all(
    sampleOffsets.map((start) => file.slice(start, start + FINGERPRINT_SAMPLE_SIZE).arrayBuffer()),
  )
  const metadata = new TextEncoder().encode(`${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000`)
  const totalLength = metadata.byteLength + samples.reduce((sum, sample) => sum + sample.byteLength, 0)
  const input = new Uint8Array(totalLength)
  input.set(metadata)
  let offset = metadata.byteLength
  for (const sample of samples) {
    input.set(new Uint8Array(sample), offset)
    offset += sample.byteLength
  }
  const digest = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const getUploadStateKey = (fingerprint: string) => `${UPLOAD_STATE_PREFIX}${fingerprint}`

const loadUploadState = (fingerprint: string, file: File): UploadState | null => {
  try {
    const raw = localStorage.getItem(getUploadStateKey(fingerprint))
    if (!raw) return null
    const state = JSON.parse(raw) as UploadState
    if (
      state.fingerprint !== fingerprint ||
      typeof state.uploadToken !== 'string' ||
      typeof state.code !== 'string' ||
      !Number.isInteger(state.partSize) ||
      state.partSize <= 0 ||
      !Number.isInteger(state.partCount) ||
      state.partCount <= 0 ||
      state.partCount !== Math.ceil(file.size / state.partSize) ||
      !Array.isArray(state.parts) ||
      !state.parts.every((part) =>
        Number.isInteger(part.partNumber) &&
        part.partNumber >= 1 &&
        part.partNumber <= state.partCount &&
        typeof part.etag === 'string' &&
        part.etag.length > 0 &&
        /^[a-f0-9]{64}$/.test(part.sha256)
      ) ||
      new Set(state.parts.map((part) => part.partNumber)).size !== state.parts.length ||
      state.fileSize !== file.size ||
      state.fileLastModified !== file.lastModified ||
      !Number.isFinite(state.createdAt) ||
      Date.now() - state.createdAt > UPLOAD_STATE_MAX_AGE
    ) {
      removeUploadState(fingerprint)
      return null
    }
    return state
  } catch {
    removeUploadState(fingerprint)
    return null
  }
}

const verifySavedParts = async (state: UploadState, file: File): Promise<boolean> => {
  for (const part of state.parts) {
    const start = (part.partNumber - 1) * state.partSize
    const end = Math.min(start + state.partSize, file.size)
    if (await sha256Blob(file.slice(start, end)) !== part.sha256) return false
  }
  return true
}

const sha256Blob = async (blob: Blob): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const saveUploadState = (state: UploadState) => {
  try {
    localStorage.setItem(getUploadStateKey(state.fingerprint), JSON.stringify(state))
  } catch {
    // Resume is optional. Uploading can continue when storage is unavailable.
  }
}

const removeUploadState = (fingerprint: string) => {
  try {
    localStorage.removeItem(getUploadStateKey(fingerprint))
  } catch {
    // Ignore storage restrictions in private browsing modes.
  }
}

const pruneExpiredUploadStates = () => {
  try {
    const now = Date.now()
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key?.startsWith(UPLOAD_STATE_PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key)
        const state = raw ? JSON.parse(raw) as Partial<UploadState> : null
        if (!state?.createdAt || now - state.createdAt > UPLOAD_STATE_MAX_AGE) {
          localStorage.removeItem(key)
        }
      } catch {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // Resume state is best-effort only.
  }
}

const cancelUpload = () => uploadController?.abort()

pruneExpiredUploadStates()
onBeforeUnmount(cancelUpload)
</script>

<style scoped>
.file-upload-container {
  padding: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.upload-dragger {
  margin-bottom: 22px;
}

.upload-dragger :deep(.el-upload-dragger) {
  border: 1px dashed var(--control-border) !important;
  border-radius: var(--radius-lg) !important;
  background: var(--surface-raised) !important;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease !important;
  padding: 34px 20px !important;
  position: relative;
  overflow: hidden;
}

.upload-dragger :deep(.el-upload-dragger:hover) {
  border-color: var(--primary-color) !important;
  background: var(--primary-soft) !important;
  box-shadow: inset 0 0 0 1px var(--primary-border) !important;
}

.upload-content {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
}

.upload-icon-wrapper {
  width: 56px;
  height: 56px;
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
}

.upload-text h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0;
}

.upload-text p {
  margin: 4px 0 0;
  color: var(--glass-text-secondary);
  font-size: 13px;
}

.upload-text span {
  color: var(--primary-color);
  font-weight: 600;
}

.upload-hint {
  font-size: 12px;
  color: var(--glass-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 2px;
}

.selected-file {
  margin-bottom: 24px;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.file-preview-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--surface-page);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.file-icon-box {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
}

.file-info-details {
  flex: 1;
  text-align: left;
}

.file-name {
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
}

.file-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--glass-text-secondary);
}

.file-type-badge {
  background: #f8fafc;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--glass-text-regular);
}

.clear-file-btn {
  background: #ffffff !important;
  border: 1px solid #e7b8b8 !important;
  color: var(--danger-color) !important;
  box-shadow: none !important;
}

.clear-file-btn:hover {
  background: #fff1f1 !important;
  border-color: var(--danger-color) !important;
}

.upload-actions {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

.upload-btn {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 52px;
  font-size: 16px;
  font-weight: 700;
  border-radius: var(--radius-md);
}

.cancel-upload-btn {
  min-width: 96px;
  height: 52px;
  border-radius: var(--radius-md);
}

.upload-progress-box {
  margin-top: 24px;
  padding: 16px 20px;
  background: var(--surface-page);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  text-align: left;
}

.progress-status-text {
  margin: 10px 0 0;
  text-align: center;
  color: var(--glass-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(5px);
}

@media (max-width: 640px) {
  .upload-dragger :deep(.el-upload-dragger) {
    padding: 28px 14px !important;
  }

  .file-name {
    max-width: 50vw;
  }

  .upload-actions {
    flex-direction: column;
  }

  .cancel-upload-btn {
    width: 100%;
  }
}
</style>
