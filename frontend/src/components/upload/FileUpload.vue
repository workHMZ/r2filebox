<template>
  <div class="file-upload-container">
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
          <el-icon size="50"><UploadFilled /></el-icon>
          </div>
          <div class="upload-text">
          <h3>{{ t('upload.drop.title') }}</h3>
          <p>{{ t('upload.drop.browse') }}</p>
          </div>
          <div class="upload-hint">
            <el-icon><InfoFilled /></el-icon>
          {{ t('upload.hint') }}
          </div>
      </div>
    </el-upload>

    <transition name="fade">
      <div v-if="selectedFile" class="selected-file">
        <div class="file-preview-card">
          <div class="file-icon-box">
            <el-icon size="32"><Document /></el-icon>
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
            @click.stop="clearFile"
          >
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
    </transition>

    <div class="upload-settings-panel">
      <div class="setting-row">
        <label class="setting-title">
          <el-icon class="label-icon"><Clock /></el-icon>
          {{ t('upload.expire') }}
        </label>
        <div class="expire-inputs">
          <el-input-number 
            v-model="form.expire_value" 
            :min="1"
            :max="999"
            controls-position="right"
            class="number-input"
          />
          <el-select v-model="form.expire_style" class="expire-select">
            <el-option :label="t('expire.minute')" value="minute" />
            <el-option :label="t('expire.hour')" value="hour" />
            <el-option :label="t('expire.day')" value="day" />
            <el-option :label="t('expire.week')" value="week" />
          </el-select>
        </div>
      </div>

      <div class="setting-row">
        <label class="setting-title">
          <el-icon class="label-icon"><Lock /></el-icon>
          {{ t('upload.access') }}
        </label>
        <el-tag type="info" effect="plain" class="auth-mode-tag">{{ t('upload.codeAccess') }}</el-tag>
      </div>
    </div>

    <el-button
      type="primary"
      size="large"
      class="upload-btn"
      :loading="uploading"
      :disabled="!selectedFile"
      @click="handleUpload"
    >
      <template #icon>
        <el-icon v-if="!uploading"><Upload /></el-icon>
      </template>
      {{ uploading ? t('upload.uploading') : t('upload.start') }}
    </el-button>

    <transition name="fade">
      <div v-if="uploading" class="upload-progress-box">
        <el-progress 
          :percentage="uploadProgress" 
          :stroke-width="6"
          :show-text="true"
          status="warning"
        />
        <p class="progress-status-text">{{ uploadStatusText }}</p>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { shareApi } from '@/api/share'
import { ElMessage } from 'element-plus'
import { 
  UploadFilled, Document, InfoFilled, Close, Clock, 
  Lock, Upload 
} from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { useI18n } from '@/i18n'

const emit = defineEmits<{
  success: [result: { code: string; share_url: string; full_share_url: string; qr_code_data: string }]
}>()

const { t } = useI18n()

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

const form = ref({
  expire_value: 1,
  expire_style: 'day',
})

const handleFileChange = (file: UploadFile) => {
  selectedFile.value = file.raw || null
  if (selectedFile.value && loadUploadState(selectedFile.value)) {
    uploadStatusText.value = t('upload.resumeDetected')
  }
}

const clearFile = () => {
  selectedFile.value = null
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

  uploading.value = true
  uploadProgress.value = 0
  uploadStatusText.value = t('upload.prepare')

  try {
    let state = loadUploadState(file)
    if (state) {
      uploadStatusText.value = t('upload.resume')
    } else {
      const initRes = await shareApi.initFileUpload({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
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
  } catch (error: any) {
    ElMessage.error(error.message || t('upload.failed'))
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
  padding: 10px 0;
}

.upload-dragger {
  margin-bottom: 24px;
}

.upload-dragger :deep(.el-upload-dragger) {
  border: 1px dashed var(--border-strong) !important;
  border-radius: var(--radius-xl) !important;
  background: #f8fafc !important;
  backdrop-filter: var(--glass-blur);
  transition: all 0.4s ease !important;
  padding: 44px 20px !important;
  position: relative;
  overflow: hidden;
}

.upload-dragger :deep(.el-upload-dragger:hover) {
  border-color: var(--primary-color) !important;
  background: #f0fdfa !important;
  box-shadow: 0 14px 32px rgba(15, 118, 110, 0.1) !important;
}

.upload-content {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.upload-icon-wrapper {
  width: 72px;
  height: 72px;
  background: #ecfdf5;
  border: 1px solid #99f6e4;
  border-radius: var(--radius-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  box-shadow: 0 8px 24px rgba(15, 118, 110, 0.12);
}

@keyframes floatBounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

.upload-text h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0;
}

.upload-text p {
  margin: 6px 0 0;
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
  margin-top: 4px;
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
  background: #f8fafc;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.file-icon-box {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #ecfdf5;
  border: 1px solid #99f6e4;
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
  background: rgba(239, 68, 68, 0.15) !important;
  border: 1px solid rgba(239, 68, 68, 0.3) !important;
  color: #fca5a5 !important;
}

.clear-file-btn:hover {
  background: rgba(239, 68, 68, 0.3) !important;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3) !important;
}

.upload-settings-panel {
  margin-bottom: 24px;
  padding: 20px 24px;
  background: #ffffff;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 20px;
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
  letter-spacing: 0.5px;
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
  border-color: #99f6e4;
  color: #115e59;
  background: #f0fdfa;
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
  background: #f8fafc;
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
</style>
