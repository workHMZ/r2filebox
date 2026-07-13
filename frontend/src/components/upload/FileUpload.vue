<template>
  <form class="file-upload-container" @submit.prevent="handleUpload">
    <el-upload
      ref="uploadRef"
      :auto-upload="false"
      :on-change="handleFileChange"
      :show-file-list="false"
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
          {{ t('upload.hint') }}
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
              <span class="file-size">{{ formatFileSize(selectedFile.size) }}</span>
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
            @click.stop="clearFile"
          >
            <el-icon aria-hidden="true"><Close /></el-icon>
          </el-button>
        </div>
      </div>
    </transition>

    <div class="upload-settings-panel">
      <div class="setting-row" role="group" aria-labelledby="file-expire-label">
        <div id="file-expire-label" class="setting-title">
          <el-icon class="label-icon" aria-hidden="true"><Clock /></el-icon>
          {{ t('upload.expire') }}
        </div>
        <div class="expire-inputs">
          <el-input-number 
            v-model="form.expire_value" 
            :min="1"
            :max="999"
            :aria-label="t('a11y.expireValue')"
            controls-position="right"
            class="number-input"
          />
          <el-select
            v-model="form.expire_style"
            :aria-label="t('a11y.expireUnit')"
            class="expire-select"
          >
            <el-option :label="t('expire.minute')" value="minute" />
            <el-option :label="t('expire.hour')" value="hour" />
            <el-option :label="t('expire.day')" value="day" />
            <el-option :label="t('expire.week')" value="week" />
          </el-select>
        </div>
      </div>

      <div class="setting-row" role="group" aria-labelledby="file-access-label">
        <div id="file-access-label" class="setting-title">
          <el-icon class="label-icon" aria-hidden="true"><Lock /></el-icon>
          {{ t('upload.access') }}
        </div>
        <el-tag type="info" effect="plain" class="auth-mode-tag">{{ t('upload.codeAccess') }}</el-tag>
      </div>
    </div>

    <TurnstileWidget
      v-if="requiresTurnstile && !hasResumableUpload"
      ref="turnstileRef"
      :site-key="turnstileSiteKey"
      action="file-share"
      @verify="turnstileToken = $event"
    />

    <el-button
      type="primary"
      size="large"
      native-type="submit"
      class="upload-btn"
      :loading="uploading"
      :aria-busy="uploading"
      :disabled="!selectedFile || (requiresTurnstile && !hasResumableUpload && !turnstileToken)"
    >
      <template #icon>
        <el-icon v-if="!uploading" aria-hidden="true"><Upload /></el-icon>
      </template>
      {{ uploading ? t('upload.uploading') : t('upload.start') }}
    </el-button>

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
    <p v-if="uploadErrorAnnouncement" class="sr-only">
      {{ uploadErrorAnnouncement }}
    </p>
  </form>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { shareApi } from '@/api/share'
import { ElMessage } from 'element-plus'
import { 
  UploadFilled, Document, InfoFilled, Close, Clock, 
  Lock, Upload 
} from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { useI18n } from '@/i18n'
import { useConfigStore } from '@/stores/config'
import TurnstileWidget from '@/components/TurnstileWidget.vue'

const emit = defineEmits<{
  success: [result: { code: string; share_url: string; full_share_url: string; qr_code_data: string }]
}>()

const { t } = useI18n()
const configStore = useConfigStore()

type UploadedPart = {
  partNumber: number
  etag: string
}

type UploadState = {
  fingerprint: string
  uploadToken: string
  uploadId: string
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

const selectedFile = ref<File | null>(null)
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadStatusText = ref('')
const uploadAnnouncement = ref('')
const uploadErrorAnnouncement = ref('')
const turnstileToken = ref('')
const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)

const requiresTurnstile = computed(() => configStore.config?.requireTurnstile === true)
const turnstileSiteKey = computed(() => configStore.config?.turnstileSiteKey || '')
const hasResumableUpload = computed(() =>
  selectedFile.value ? Boolean(loadUploadState(selectedFile.value)) : false,
)

const form = ref({
  expire_value: 1,
  expire_style: 'day',
})

const handleFileChange = (file: UploadFile) => {
  selectedFile.value = file.raw || null
  uploadErrorAnnouncement.value = ''
  if (selectedFile.value) {
    const fileAnnouncement = t('a11y.fileSelected', {
      name: selectedFile.value.name,
      size: formatFileSize(selectedFile.value.size),
    })
    if (loadUploadState(selectedFile.value)) {
      uploadStatusText.value = t('upload.resumeDetected')
      uploadAnnouncement.value = `${fileAnnouncement} ${t('upload.resumeDetected')}`
    } else {
      uploadAnnouncement.value = fileAnnouncement
    }
  }
}

const clearFile = () => {
  selectedFile.value = null
  uploadAnnouncement.value = t('a11y.fileCleared')
  uploadErrorAnnouncement.value = ''
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
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
  let state = loadUploadState(file)
  if (!state && requiresTurnstile.value && !turnstileToken.value) {
    ElMessage.warning(t('turnstile.required'))
    return
  }

  uploading.value = true
  uploadErrorAnnouncement.value = ''
  uploadProgress.value = 0
  uploadStatusText.value = t('upload.prepare')

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
      })

      if (initRes.code !== 200) {
        throw new Error(initRes.message || t('upload.initFailed'))
      }

      state = {
        fingerprint: getFileFingerprint(file),
        uploadToken: initRes.data.uploadToken,
        uploadId: initRes.data.uploadId,
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
      const part = await uploadPartWithRetry(state.uploadToken, partNumber, file.slice(start, end))
      state.parts.push(part)
      state.parts.sort((a, b) => a.partNumber - b.partNumber)
      saveUploadState(state)
      updateProgress(state)
    }

    uploadStatusText.value = t('upload.complete')
    const res = await shareApi.completeFileUpload({
      uploadToken: state.uploadToken,
      code: state.code,
      parts: state.parts,
    })

    if (res.code !== 200) {
      throw new Error(res.message || t('upload.mergeFailed'))
    }

    removeUploadState(file)
    turnstileRef.value?.reset()
    uploadProgress.value = 100
    uploadStatusText.value = t('upload.successStatus')
    ElMessage.success(t('upload.done'))
    
    emit('success', {
      code: res.data.code,
      share_url: res.data.share_url,
      full_share_url: res.data.full_share_url,
      qr_code_data: res.data.qr_code_data,
    })
    
    setTimeout(() => {
      selectedFile.value = null
      uploading.value = false
      uploadProgress.value = 0
    }, 2000)
  } catch (error: unknown) {
    turnstileRef.value?.reset()
    const errorMessage = error instanceof Error ? error.message : t('upload.failed')
    uploadErrorAnnouncement.value = errorMessage
    ElMessage.error(errorMessage)
    uploading.value = false
  }
}

const uploadPartWithRetry = async (uploadToken: string, partNumber: number, chunk: Blob): Promise<UploadedPart> => {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await shareApi.uploadFilePart(uploadToken, partNumber, chunk)
      return res.data
    } catch (error) {
      lastError = error
      uploadStatusText.value = t('upload.retry', { part: partNumber, attempt })
      await sleep(500 * attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(t('upload.failed'))
}

const updateProgress = (state: UploadState) => {
  uploadProgress.value = Math.min(95, Math.floor((state.parts.length / state.partCount) * 95))
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getFileFingerprint = (file: File) => `${file.name}:${file.size}:${file.lastModified}`

const getUploadStateKey = (file: File) => `${UPLOAD_STATE_PREFIX}${getFileFingerprint(file)}`

const loadUploadState = (file: File): UploadState | null => {
  try {
    const raw = localStorage.getItem(getUploadStateKey(file))
    if (!raw) return null
    const state = JSON.parse(raw) as UploadState
    if (
      state.fingerprint !== getFileFingerprint(file) ||
      state.fileSize !== file.size ||
      state.fileLastModified !== file.lastModified ||
      Date.now() - state.createdAt > 24 * 60 * 60 * 1000
    ) {
      removeUploadState(file)
      return null
    }
    return state
  } catch {
    removeUploadState(file)
    return null
  }
}

const saveUploadState = (state: UploadState) => {
  localStorage.setItem(`${UPLOAD_STATE_PREFIX}${state.fingerprint}`, JSON.stringify(state))
}

const removeUploadState = (file: File) => {
  localStorage.removeItem(getUploadStateKey(file))
}
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

.upload-settings-panel {
  display: grid;
  margin-bottom: 22px;
  padding: 20px 0 0;
  grid-template-columns: minmax(0, 1.45fr) minmax(180px, 0.55fr);
  gap: 24px;
  border-top: 1px solid var(--border-subtle);
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}

.setting-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--glass-text-regular);
  font-size: 13px;
  letter-spacing: 0;
}

.label-icon {
  color: var(--primary-color);
}

.expire-inputs {
  display: flex;
  gap: 12px;
}

.number-input {
  width: 140px;
}

.expire-select {
  width: 120px;
}

.auth-mode-tag {
  width: fit-content;
  border-color: var(--primary-border);
  color: var(--primary-active);
  background: var(--primary-soft);
}

.upload-btn {
  width: 100%;
  height: 52px;
  font-size: 16px;
  font-weight: 700;
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

  .upload-settings-panel {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .expire-inputs {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 112px;
  }

  .number-input,
  .expire-select {
    width: 100%;
  }

  .file-name {
    max-width: 50vw;
  }
}
</style>
