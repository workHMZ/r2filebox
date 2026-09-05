<template>
  <form class="file-upload-container" @submit.prevent="handleUpload">
    <!-- Capture-phase only: the dragger still handles the drop and keeps the
         first file. This just notices the files it silently discarded. -->
    <div @drop.capture="handleMultiFileDrop">
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
    </div>

    <transition name="fade">
      <div v-if="selectedFile" class="selected-file">
        <div class="file-preview-card">
          <div class="file-icon-box">
            <el-icon size="32" :color="selectedFileIconColor" aria-hidden="true">
              <component :is="selectedFileIcon" />
            </el-icon>
          </div>
          <div class="file-info-details">
            <div class="file-name">{{ selectedFile.name }}</div>
            <div class="file-meta">
              <span class="file-size">{{ formatFileSize(selectedFile.size, getLocaleTag(locale)) }}</span>
              <span class="file-type-badge">{{ t(selectedFileTypeKey) }}</span>
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
      show-security-tip
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
        :disabled="!selectedFile || !selectedFingerprint || !selectedContentFingerprint || fingerprinting || (requiresTurnstile && !hasResumableUpload && !turnstileToken)"
      >
        <template #icon>
          <el-icon v-if="!uploading && !fingerprinting" aria-hidden="true"><Upload /></el-icon>
        </template>
        {{ uploading ? t('upload.uploading') : fingerprinting ? t('upload.fingerprinting') : t('upload.start') }}
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
import type { Component } from 'vue'
import {
  shareApi,
  UploadPartError,
  type FileUploadPartData,
  type FileUploadSuccessData,
  type ShareCreatedResult,
} from '@/api/share'
import { isTerminalUploadError } from '@/utils/upload-error'
import { ElMessage } from 'element-plus'
import {
  UploadFilled,
  Document,
  InfoFilled,
  Close,
  Upload,
  Picture,
  VideoPlay,
  Headset,
  Files as ArchiveIcon,
} from '@element-plus/icons-vue'
import type { UploadFile, UploadInstance } from 'element-plus'
import { getLocaleTag, useI18n } from '@/i18n'
import { useConfigStore } from '@/stores/config'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import ShareSettings from '@/components/upload/ShareSettings.vue'
import { expireSelectionFromHours, type ExpireStyle } from '@/utils/expiration'
import { formatFileSize } from '@/utils/format'
import { classifyFile, inferMimeType, type FileCategory } from '@/utils/file-type'
import {
  CONTENT_FINGERPRINT_ALGORITHM,
  CONTENT_FINGERPRINT_PART_SIZE,
  fingerprintBlob,
  sha256Blob,
  type ContentFingerprintResult,
} from '@/utils/content-fingerprint'

const emit = defineEmits<{
  success: [result: ShareCreatedResult]
}>()

const { locale, t } = useI18n()
const configStore = useConfigStore()
const BYTES_PER_MB = 1024 * 1024

type UploadedPart = {
  partNumber: number
  etag: string
  sha256: string
  partSize?: number
  receipt?: string
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
  fingerprintAlgorithm?: string
  contentFingerprint?: string
}

type DedupCapability = {
  token: string
  expiresAt: string
}

const UPLOAD_STATE_PREFIX = 'r2filebox-upload:'
const UPLOAD_STATE_MAX_AGE = 24 * 60 * 60 * 1000
const DEDUP_CAPABILITY_PREFIX = 'r2filebox-dedup:'
const MAX_DEDUP_TOKEN_LENGTH = 4096
const MAX_UPLOAD_PARTS = 12
const FINGERPRINT_SAMPLE_SIZE = 64 * 1024

const selectedFile = ref<File | null>(null)
const uploadRef = ref<UploadInstance | null>(null)
const selectedFingerprint = ref('')
const selectedContentFingerprint = ref<ContentFingerprintResult | null>(null)
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
let fingerprintController: AbortController | null = null

const fileIconByCategory: Record<FileCategory, Component> = {
  image: Picture,
  video: VideoPlay,
  audio: Headset,
  document: Document,
  archive: ArchiveIcon,
  other: Document,
}
const fileIconColorByCategory: Record<FileCategory, string> = {
  image: 'var(--info-color)',
  video: 'var(--success-color)',
  audio: 'var(--warning-color)',
  document: 'var(--text-secondary)',
  archive: 'var(--warning-color)',
  other: 'var(--text-regular)',
}
const fileTypeKeyByCategory: Record<FileCategory, string> = {
  image: 'fileType.image',
  video: 'fileType.video',
  audio: 'fileType.audio',
  document: 'fileType.document',
  archive: 'fileType.archive',
  other: 'fileType.unknown',
}
const detailedDocumentTypeKeyByMime: Readonly<Record<string, string>> = {
  'application/pdf': 'fileType.pdf',
  'application/msword': 'fileType.word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'fileType.word',
  'application/vnd.ms-excel': 'fileType.excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'fileType.excel',
}
const selectedFileCategory = computed<FileCategory>(() => {
  const file = selectedFile.value
  return file ? classifyFile(file.name, file.type) : 'other'
})
const selectedFileIcon = computed(() => fileIconByCategory[selectedFileCategory.value])
const selectedFileIconColor = computed(() => fileIconColorByCategory[selectedFileCategory.value])
const selectedFileTypeKey = computed(() => {
  const file = selectedFile.value
  if (!file) return 'fileType.unknown'
  return detailedDocumentTypeKeyByMime[inferMimeType(file.name, file.type)]
    || fileTypeKeyByCategory[selectedFileCategory.value]
})

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

// Element Plus keeps only the first dropped file when `multiple` is off, and it
// does so silently. Say which file survived so the rest are not lost quietly.
const handleMultiFileDrop = (event: DragEvent) => {
  if (uploading.value || fingerprinting.value) return
  const files = event.dataTransfer?.files
  if (!files || files.length < 2) return
  ElMessage.warning(t('upload.singleFileOnly', { name: files[0].name }))
}

const handleFileChange = async (file: UploadFile) => {
  if (uploading.value) return
  fingerprintController?.abort()
  const currentVersion = ++selectionVersion
  selectedFile.value = file.raw || null
  selectedFingerprint.value = ''
  selectedContentFingerprint.value = null
  resumableState.value = null
  const selected = selectedFile.value
  if (selected) {
    const sizeLimit = maxUploadBytes.value
    if (sizeLimit !== null && selected.size > sizeLimit) {
      selectedFile.value = null
      uploadRef.value?.clearFiles()
      const message = t('api.share.fileTooLarge', {
        max: Math.floor(sizeLimit / BYTES_PER_MB),
      })
      uploadStatusText.value = ''
      uploadAnnouncement.value = message
      ElMessage.error(message)
      return
    }
    const controller = new AbortController()
    fingerprintController = controller
    const fileAnnouncement = t('a11y.fileSelected', {
      name: selected.name,
      size: formatFileSize(selected.size, getLocaleTag(locale.value)),
    })
    uploadStatusText.value = t('upload.fingerprinting')
    uploadAnnouncement.value = `${fileAnnouncement} ${t('upload.fingerprinting')}`
    fingerprinting.value = true
    try {
      const { resumeFingerprint, contentFingerprint } = await getFileFingerprints(
        selected,
        controller.signal,
      )
      if (currentVersion !== selectionVersion || selectedFile.value !== selected) return
      selectedFingerprint.value = resumeFingerprint
      selectedContentFingerprint.value = contentFingerprint
      const savedState = loadUploadState(resumeFingerprint, selected, contentFingerprint)
      const savedStateVerified = savedState
        ? await verifySavedParts(savedState, selected, contentFingerprint, controller.signal)
        : false
      if (currentVersion !== selectionVersion || selectedFile.value !== selected) return
      resumableState.value = savedState && savedStateVerified ? savedState : null
      // The saved parts no longer match this file, so the reservation the
      // Worker still holds for them can never be resumed.
      if (savedState && !resumableState.value) discardUploadState(savedState)
      if (resumableState.value) {
        uploadStatusText.value = t('upload.resumeDetected')
        uploadAnnouncement.value = `${fileAnnouncement} ${t('upload.resumeDetected')}`
      } else {
        uploadStatusText.value = ''
        uploadAnnouncement.value = fileAnnouncement
      }
    } catch (error) {
      if (isAbortError(error)) return
      if (currentVersion === selectionVersion) {
        console.error('Failed to fingerprint selected file:', error)
        selectedFingerprint.value = ''
        selectedContentFingerprint.value = null
        uploadStatusText.value = ''
        ElMessage.error(t('upload.fingerprintFailed'))
      }
    } finally {
      if (fingerprintController === controller) fingerprintController = null
      if (currentVersion === selectionVersion) fingerprinting.value = false
    }
  }
}

const clearFile = () => {
  if (uploading.value) return
  fingerprintController?.abort()
  fingerprintController = null
  selectionVersion++
  selectedFile.value = null
  selectedFingerprint.value = ''
  selectedContentFingerprint.value = null
  resumableState.value = null
  fingerprinting.value = false
  uploadStatusText.value = ''
  uploadRef.value?.clearFiles()
  uploadAnnouncement.value = t('a11y.fileCleared')
}

const handleUpload = async () => {
  const file = selectedFile.value
  if (!file) {
    ElMessage.warning(t('upload.selectFirst'))
    return
  }

  await configStore.fetchConfig()
  const fingerprint = selectedFingerprint.value
  const contentFingerprint = selectedContentFingerprint.value
  if (selectedFile.value !== file) return
  if (!fingerprint || !contentFingerprint) {
    ElMessage.error(t('upload.fingerprintFailed'))
    return
  }
  let state = resumableState.value
  if (
    state &&
    (
      state.fingerprint !== fingerprint ||
      state.fileName !== file.name ||
      state.fileSize !== file.size ||
      state.fileLastModified !== file.lastModified ||
      (
        (state.fingerprintAlgorithm !== undefined || state.contentFingerprint !== undefined) &&
        (
          state.fingerprintAlgorithm !== contentFingerprint.algorithm ||
          state.contentFingerprint !== contentFingerprint.fingerprint
        )
      )
    )
  ) {
    // This upload is about to start a fresh session, so the mismatched one is
    // abandoned for good: release it instead of leaving it to go stale.
    discardUploadState(state)
    state = null
    resumableState.value = null
  }
  if (!state && requiresTurnstile.value && !turnstileToken.value) {
    ElMessage.warning(t('turnstile.required'))
    return
  }

  uploading.value = true
  uploadProgress.value = 0
  uploadStatusText.value = state ? t('upload.resume') : t('upload.checkInstant')
  const controller = new AbortController()
  uploadController = controller

  let completedCount = 0
  let fatalUploadError: unknown = null

  try {
    if (state) {
      uploadStatusText.value = t('upload.resume')
      completedCount = state.parts.length
    } else {
      const cachedCapability = loadDedupCapability(contentFingerprint, file.size)
      const initRes = await shareApi.initFileUpload({
        filename: file.name,
        mimeType: inferMimeType(file.name, file.type),
        size: file.size,
        turnstileToken: turnstileToken.value || undefined,
        fingerprintAlgorithm: CONTENT_FINGERPRINT_ALGORITHM,
        contentFingerprint: contentFingerprint.fingerprint,
        dedupToken: cachedCapability?.token,
        ...form.value,
      }, controller.signal)

      if (initRes.code !== 200) {
        throw new Error(initRes.message || t('upload.initFailed'))
      }
      if (initRes.data.instantUpload === true) {
        finishSuccessfulUpload(initRes.data, fingerprint, contentFingerprint, file.size)
        return
      }
      if (cachedCapability) removeDedupCapability(contentFingerprint, file.size)
      if (
        initRes.data.partSize !== CONTENT_FINGERPRINT_PART_SIZE ||
        initRes.data.partCount !== contentFingerprint.partSha256.length
      ) {
        throw new Error(t('upload.fingerprintFailed'))
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
        fingerprintAlgorithm: CONTENT_FINGERPRINT_ALGORITHM,
        contentFingerprint: contentFingerprint.fingerprint,
      }
      saveUploadState(state)
      resumableState.value = state
    }

    // Bytes already on the server per part. Parts restored from a resumable
    // state start out complete, and a retried part restarts from zero, so the
    // bar tracks real transfer instead of jumping one whole part at a time.
    const sentBytesByPart = new Map<number, number>()
    const partByteLength = (partNumber: number) =>
      Math.min(partNumber * state!.partSize, file.size) - ((partNumber - 1) * state!.partSize)
    for (const part of state.parts) {
      sentBytesByPart.set(part.partNumber, partByteLength(part.partNumber))
    }

    const uploadOnePart = async (index: number) => {
      const partNumber = index + 1
      const start = index * state!.partSize
      const end = Math.min(start + state!.partSize, file.size)
      const chunk = file.slice(start, end)

      uploadStatusText.value = t('upload.part', { current: completedCount + 1, total: state!.partCount })

      try {
        const expectedSha256 = state!.partSize === CONTENT_FINGERPRINT_PART_SIZE
          ? contentFingerprint.partSha256[index]
          : await sha256Blob(chunk)
        if (!expectedSha256) throw new Error(t('upload.partVerificationFailed'))
        const part = await uploadPartWithRetry(
          state!.uploadToken,
          partNumber,
          chunk,
          controller.signal,
          (sentBytes) => {
            sentBytesByPart.set(partNumber, Math.min(sentBytes, chunk.size))
            updateProgress(sentBytesByPart, file.size)
          },
        )
        state!.parts.push(verifyUploadedPart(part, partNumber, chunk.size, expectedSha256))
        state!.parts.sort((a, b) => a.partNumber - b.partNumber)
        saveUploadState(state!)
        resumableState.value = state
        completedCount++
        sentBytesByPart.set(partNumber, chunk.size)
        updateProgress(sentBytesByPart, file.size)
      } catch (error) {
        sentBytesByPart.delete(partNumber)
        if (!fatalUploadError && !controller.signal.aborted && !isAbortError(error)) {
          fatalUploadError = error
          controller.abort()
        }
        throw error
      }
    }

    const pendingIndices: number[] = []
    for (let index = 0; index < state.partCount; index++) {
      const partNumber = index + 1
      if (!state.parts.some((part) => part.partNumber === partNumber)) {
        pendingIndices.push(index)
      }
    }
    updateProgress(sentBytesByPart, file.size)

    const worker = async () => {
      while (true) {
        if (controller.signal.aborted) return
        const index = pendingIndices.shift()
        if (index === undefined) return
        await uploadOnePart(index)
      }
    }

    const concurrency = Math.min(3, pendingIndices.length)
    if (concurrency > 0) {
      const workers = Array.from({ length: concurrency }, () => worker())
      const results = await Promise.allSettled(workers)

      if (fatalUploadError) {
        throw fatalUploadError
      }

      const rejected = results.find((result) => result.status === 'rejected')
      if (rejected?.status === 'rejected') {
        throw rejected.reason
      }
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
    finishSuccessfulUpload(res.data, state.fingerprint, contentFingerprint, file.size)
  } catch (error: unknown) {
    turnstileRef.value?.reset()

    if (fatalUploadError) {
      const actualError = fatalUploadError
      if (state && isTerminalUploadError(actualError)) {
        removeUploadState(state.fingerprint)
        resumableState.value = null
      }
      const errorMessage = actualError instanceof Error ? actualError.message : t('upload.failed')
      ElMessage.error(errorMessage)
      uploading.value = false
      return
    }

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

const finishSuccessfulUpload = (
  result: FileUploadSuccessData,
  resumeFingerprint: string,
  contentFingerprint: ContentFingerprintResult,
  fileSize: number,
) => {
  saveDedupCapability(contentFingerprint, fileSize, result.dedupToken, result.dedupTokenExpiresAt)
  removeUploadState(resumeFingerprint)
  resumableState.value = null
  turnstileRef.value?.reset()
  uploadProgress.value = 100
  const statusKey = result.instantUpload === true ? 'upload.instantDone' : 'upload.successStatus'
  uploadStatusText.value = t(statusKey)
  uploadAnnouncement.value = t(statusKey)
  ElMessage.success(t(result.instantUpload === true ? 'upload.instantDone' : 'upload.done'))

  emit('success', {
    code: result.code,
    share_url: result.share_url,
    full_share_url: result.full_share_url,
    qr_code_data: result.qr_code_data,
    expire_at: result.expire_at,
    max_downloads: result.max_downloads,
  })

  uploading.value = false
  selectedFile.value = null
  selectedFingerprint.value = ''
  selectedContentFingerprint.value = null
  uploadRef.value?.clearFiles()
  uploadProgress.value = 0
}

const uploadPartWithRetry = async (
  uploadToken: string,
  partNumber: number,
  chunk: Blob,
  signal: AbortSignal,
  onProgress?: (sentBytes: number) => void,
): Promise<FileUploadPartData> => {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await shareApi.uploadFilePart(uploadToken, partNumber, chunk, signal, onProgress)
      return res.data
    } catch (error) {
      lastError = error
      // A retried attempt resends the whole part, so drop what the failed
      // attempt had reported instead of counting those bytes twice.
      onProgress?.(0)
      if (signal.aborted || !shouldRetryPart(error) || attempt === 3) break
      uploadStatusText.value = t('upload.retry', { part: partNumber, attempt })
      const baseDelay = error instanceof UploadPartError && error.retryAfterMs !== null
        ? error.retryAfterMs
        : 500 * Math.pow(2, attempt - 1)
      const jitter = Math.random() * 200
      await sleep(baseDelay + jitter, signal)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(t('upload.failed'))
}

const verifyUploadedPart = (
  part: FileUploadPartData,
  expectedPartNumber: number,
  expectedPartSize: number,
  expectedSha256: string,
): UploadedPart => {
  if (
    part.partNumber !== expectedPartNumber ||
    part.partSize !== expectedPartSize ||
    part.sha256 !== expectedSha256 ||
    typeof part.etag !== 'string' ||
    !part.etag ||
    typeof part.receipt !== 'string' ||
    !part.receipt
  ) {
    throw new Error(t('upload.partVerificationFailed'))
  }
  return {
    partNumber: part.partNumber,
    etag: part.etag,
    sha256: part.sha256,
    partSize: part.partSize,
    receipt: part.receipt,
  }
}

// Capped at 95 so the bar keeps a visible remainder for the completion request,
// which merges the parts server-side after the last byte is sent.
const updateProgress = (sentBytesByPart: Map<number, number>, totalBytes: number) => {
  if (totalBytes <= 0) return
  let sent = 0
  for (const bytes of sentBytesByPart.values()) sent += bytes
  uploadProgress.value = Math.min(95, Math.floor((sent / totalBytes) * 95))
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
  if (!(error instanceof UploadPartError)) {
    return error instanceof TypeError
  }
  if (error.errorCode === 'api.share.partIncompleteRetry') {
    return true
  }
  return error.status === 429 || error.status >= 500
}

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

const getFileFingerprints = async (file: File, signal: AbortSignal) => {
  const [resumeFingerprint, contentFingerprint] = await Promise.all([
    getFileFingerprint(file, signal),
    fingerprintBlob(file, signal),
  ])
  return { resumeFingerprint, contentFingerprint }
}

const getFileFingerprint = async (file: File, signal: AbortSignal): Promise<string> => {
  throwIfFingerprintAborted(signal)
  const sampleOffsets = [
    0,
    Math.max(0, Math.floor((file.size - FINGERPRINT_SAMPLE_SIZE) / 2)),
    Math.max(0, file.size - FINGERPRINT_SAMPLE_SIZE),
  ]
  const samples = await Promise.all(
    sampleOffsets.map((start) => file.slice(start, start + FINGERPRINT_SAMPLE_SIZE).arrayBuffer()),
  )
  throwIfFingerprintAborted(signal)
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
  throwIfFingerprintAborted(signal)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const getUploadStateKey = (fingerprint: string) => `${UPLOAD_STATE_PREFIX}${fingerprint}`

const loadUploadState = (
  fingerprint: string,
  file: File,
  contentFingerprint: ContentFingerprintResult,
): UploadState | null => {
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
      state.partCount > MAX_UPLOAD_PARTS ||
      state.partCount !== Math.ceil(file.size / state.partSize) ||
      !Array.isArray(state.parts) ||
      !state.parts.every((part) =>
        Number.isInteger(part.partNumber) &&
        part.partNumber >= 1 &&
        part.partNumber <= state.partCount &&
        typeof part.etag === 'string' &&
        part.etag.length > 0 &&
        typeof part.sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(part.sha256) &&
        (part.partSize === undefined || (Number.isSafeInteger(part.partSize) && part.partSize > 0)) &&
        (part.receipt === undefined || (typeof part.receipt === 'string' && part.receipt.length > 0))
      ) ||
      new Set(state.parts.map((part) => part.partNumber)).size !== state.parts.length ||
      state.fileName !== file.name ||
      state.fileSize !== file.size ||
      state.fileLastModified !== file.lastModified ||
      !Number.isFinite(state.createdAt) ||
      Date.now() - state.createdAt > UPLOAD_STATE_MAX_AGE
    ) {
      removeUploadState(fingerprint)
      return null
    }
    const usesContentFingerprint = state.fingerprintAlgorithm !== undefined ||
      state.contentFingerprint !== undefined
    if (
      usesContentFingerprint &&
      (
        state.fingerprintAlgorithm !== contentFingerprint.algorithm ||
        state.contentFingerprint !== contentFingerprint.fingerprint ||
        state.partSize !== CONTENT_FINGERPRINT_PART_SIZE ||
        state.partCount !== contentFingerprint.partSha256.length ||
        state.parts.some((part) => {
          const expectedPartSize = part.partNumber === state.partCount
            ? file.size - ((state.partCount - 1) * state.partSize)
            : state.partSize
          return part.partSize !== expectedPartSize || !part.receipt
        })
      )
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

const verifySavedParts = async (
  state: UploadState,
  file: File,
  contentFingerprint: ContentFingerprintResult,
  signal: AbortSignal,
): Promise<boolean> => {
  for (const part of state.parts) {
    throwIfFingerprintAborted(signal)
    const start = (part.partNumber - 1) * state.partSize
    const end = Math.min(start + state.partSize, file.size)
    const expectedSha256 = state.partSize === CONTENT_FINGERPRINT_PART_SIZE
      ? contentFingerprint.partSha256[part.partNumber - 1]
      : await sha256Blob(file.slice(start, end), signal)
    if (!expectedSha256 || expectedSha256 !== part.sha256) return false
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  }
  return true
}

const throwIfFingerprintAborted = (signal: AbortSignal) => {
  if (!signal.aborted) return
  throw signal.reason instanceof DOMException
    ? signal.reason
    : new DOMException('Fingerprint cancelled', 'AbortError')
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

/**
 * Drop a resumable upload the browser can no longer continue, and tell the
 * Worker so it releases the storage reservation and the uploaded R2 parts now
 * rather than waiting for the session to go stale and a Cron run to reclaim it.
 * Best effort: the local state is discarded either way.
 */
const discardUploadState = (state: UploadState | null) => {
  if (!state) return
  removeUploadState(state.fingerprint)
  if (!state.uploadToken) return
  void shareApi.abortFileUpload(state.uploadToken).catch(() => {
    // The scheduled cleanup still reclaims this session on its own.
  })
}

const getDedupCapabilityKey = (
  contentFingerprint: ContentFingerprintResult,
  fileSize: number,
) => `${DEDUP_CAPABILITY_PREFIX}${contentFingerprint.algorithm}:${fileSize}:${contentFingerprint.fingerprint}`

const loadDedupCapability = (
  contentFingerprint: ContentFingerprintResult,
  fileSize: number,
): DedupCapability | null => {
  const key = getDedupCapabilityKey(contentFingerprint, fileSize)
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const capability = JSON.parse(raw) as unknown
    if (!isUsableDedupCapability(capability)) {
      localStorage.removeItem(key)
      return null
    }
    return capability
  } catch {
    try {
      localStorage.removeItem(key)
    } catch {
      // Capabilities are optional when local storage is unavailable.
    }
    return null
  }
}

const saveDedupCapability = (
  contentFingerprint: ContentFingerprintResult,
  fileSize: number,
  token?: string,
  expiresAt?: string,
) => {
  if (token === undefined && expiresAt === undefined) return
  const key = getDedupCapabilityKey(contentFingerprint, fileSize)
  const capability = { token, expiresAt }
  try {
    if (!isUsableDedupCapability(capability)) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify(capability))
  } catch {
    // Instant upload is an optional optimization.
  }
}

const removeDedupCapability = (
  contentFingerprint: ContentFingerprintResult,
  fileSize: number,
) => {
  try {
    localStorage.removeItem(getDedupCapabilityKey(contentFingerprint, fileSize))
  } catch {
    // Ignore storage restrictions in private browsing modes.
  }
}

const isUsableDedupCapability = (value: unknown): value is DedupCapability => {
  if (!value || typeof value !== 'object') return false
  const capability = value as Partial<DedupCapability>
  const expiresAt = typeof capability.expiresAt === 'string'
    ? Date.parse(capability.expiresAt)
    : Number.NaN
  return typeof capability.token === 'string' &&
    capability.token.length > 0 &&
    capability.token.length <= MAX_DEDUP_TOKEN_LENGTH &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now()
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

const pruneInvalidDedupCapabilities = () => {
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key?.startsWith(DEDUP_CAPABILITY_PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key)
        const capability = raw ? JSON.parse(raw) as unknown : null
        if (!isUsableDedupCapability(capability)) localStorage.removeItem(key)
      } catch {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // Capability caching is best-effort only.
  }
}

const cancelUpload = () => uploadController?.abort()

pruneExpiredUploadStates()
pruneInvalidDedupCapabilities()
onBeforeUnmount(() => {
  fingerprintController?.abort()
  cancelUpload()
})
</script>

<style scoped>
.file-upload-container {
  padding: 0;
}


.upload-dragger {
  margin-bottom: 22px;
}

.upload-dragger :deep(.el-upload-dragger) {
  display: flex;
  height: var(--share-content-height, 230px);
  min-height: var(--share-content-height, 230px);
  align-items: center;
  justify-content: center;
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
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--glass-text-regular);
}

.clear-file-btn {
  background: var(--surface-card-solid) !important;
  border: 1px solid var(--danger-border) !important;
  color: var(--danger-color) !important;
  box-shadow: none !important;
}

.clear-file-btn:hover {
  background: var(--danger-soft) !important;
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
