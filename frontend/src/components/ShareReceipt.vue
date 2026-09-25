<template>
  <el-dialog
    v-model="showShareDialog"
    :title="t('share.success.title')"
    width="520px"
    :close-on-click-modal="false"
    @closed="handleDialogClosed"
  >
    <div class="receipt">
      <p class="receipt-lede">{{ t('share.success.subtitle') }}</p>

      <div class="stub stub--perforated">
        <div class="stub-code">
          <span class="eyebrow stub-eyebrow">{{ t('share.code.label') }}</span>
          <div class="stub-code-row">
            <span class="stub-code-value" :title="t('a11y.selectShareCode')">{{ shareCode }}</span>
            <ActionFeedbackButton
              type="primary"
              size="small"
              :icon="CopyDocument"
              :success="codeCopied"
              @click="copyShareCode"
            >
              {{ t('share.code.copy') }}
            </ActionFeedbackButton>
          </div>
        </div>

        <dl class="stub-terms">
          <div class="stub-term">
            <dt>{{ t('share.success.expire') }}</dt>
            <dd>{{ shareExpireText }}</dd>
          </div>
          <div class="stub-term">
            <dt>{{ t('share.success.maxDownloads') }}</dt>
            <dd>{{ shareMaxDownloadsText }}</dd>
          </div>
        </dl>

        <div v-if="qrCodeDataUrl" class="receipt-qr">
          <div class="receipt-qr-card">
            <img :src="qrCodeDataUrl" alt="" aria-hidden="true" class="receipt-qr-image" />
          </div>
          <p class="receipt-qr-tip">{{ t('share.qr.tip') }}</p>
        </div>
      </div>

      <el-input
        v-model="shareUrl"
        readonly
        size="large"
        class="receipt-link"
        :aria-label="t('a11y.shareLink')"
      >
        <template #append>
          <ActionFeedbackButton
            type="primary"
            :icon="CopyDocument"
            :success="urlCopied"
            @click="copyShareUrl"
          >
            {{ t('share.link.copy') }}
          </ActionFeedbackButton>
        </template>
      </el-input>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument } from '@element-plus/icons-vue'
import ActionFeedbackButton from '@/components/ActionFeedbackButton.vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import type { ShareCreatedResult } from '@/api/share'
import { getLocaleTag, useI18n } from '@/i18n'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{ result: ShareCreatedResult }>()
const emit = defineEmits<{ closed: [] }>()
const showShareDialog = defineModel<boolean>({ default: false })
const { locale, t } = useI18n()
const shareUrl = ref('')
const shareCode = ref('')
const shareExpireAt = ref('')
const shareMaxDownloads = ref<number | null>(null)
const qrCodeDataUrl = ref('')
let qrGenerationVersion = 0

const shareExpireText = computed(() => (
  shareExpireAt.value
    ? formatDateTime(shareExpireAt.value, getLocaleTag(locale.value))
    : '—'
))
const shareMaxDownloadsText = computed(() => (
  shareMaxDownloads.value === null
    ? t('share.success.unlimited')
    : t('share.success.times', { count: shareMaxDownloads.value })
))

const renderReceipt = async (result: ShareCreatedResult) => {
  const version = ++qrGenerationVersion
  let url = result.full_share_url || result.share_url

  if (!url.includes('#')) {
    if (url.startsWith('/')) {
      url = `${window.location.origin}/#${url}`
    } else {
      const pathIndex = url.indexOf('/share/')
      if (pathIndex > 0) {
        url = url.substring(0, pathIndex) + '/#' + url.substring(pathIndex)
      }
    }
  }

  shareUrl.value = url
  shareCode.value = result.code
  shareExpireAt.value = result.expire_at
  shareMaxDownloads.value = result.max_downloads
  qrCodeDataUrl.value = ''

  try {
    const { default: QRCode } = await import('qrcode')
    const qrData = result.qr_code_data || url
    const generatedQrCode = await QRCode.toDataURL(qrData, {
      width: 180,
      margin: 2,
      // Scanners need a light quiet zone, so the code stays ink-on-paper even
      // though it sits inside the dark receipt.
      color: {
        dark: '#141413',
        light: '#faf9f5',
      },
    })
    if (version === qrGenerationVersion) qrCodeDataUrl.value = generatedQrCode
  } catch (error) {
    console.error('Failed to generate share QR code:', error)
    if (version === qrGenerationVersion) qrCodeDataUrl.value = ''
  }
}

const { active: codeCopied, reset: resetCodeCopied, show: showCodeCopied } = useActionFeedback()
const { active: urlCopied, reset: resetUrlCopied, show: showUrlCopied } = useActionFeedback()

const copyShareUrl = async () => {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    ElMessage.success(t('share.link.copied'))
    showUrlCopied()
  } catch {
    ElMessage.error(t('shareView.copyFailed'))
  }
}

const copyShareCode = async () => {
  try {
    await navigator.clipboard.writeText(shareCode.value)
    ElMessage.success(t('share.code.copied'))
    showCodeCopied()
  } catch {
    ElMessage.error(t('shareView.copyFailed'))
  }
}

const handleDialogClosed = () => {
  resetCodeCopied()
  resetUrlCopied()
  emit('closed')
}

watch(() => props.result, renderReceipt, { immediate: true })
</script>

<style scoped>
/* ---- Receipt dialog ---------------------------------------------------- */
.receipt {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.receipt-lede {
  color: var(--text-secondary);
  font-size: var(--fs-body-sm);
}

.stub {
  /* The receipt is torn from the dialog sheet, not from the page floor. */
  --stub-notch: var(--surface-overlay);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--surface-page);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
}

.stub-eyebrow {
  color: var(--text-secondary);
}

.stub-code {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.stub-code-row {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.stub-code-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--text-primary);
  cursor: pointer;
  font-family: var(--font-code);
  font-size: var(--fs-display-sm);
  font-weight: 600;
  letter-spacing: 0.1em;
  line-height: 1.1;
  user-select: all;
}

.stub-terms {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  padding-top: var(--space-sm);
  border-top: 1px dashed var(--border-subtle);
}

.stub-term {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-xs);
}

.stub-term dt {
  color: var(--text-secondary);
  font-size: var(--fs-caption);
}

.stub-term dd {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-align: right;
}

.receipt-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2xs);
  padding-top: var(--space-sm);
  border-top: 1px dashed var(--border-subtle);
}

.receipt-qr-card {
  display: inline-flex;
  padding: var(--space-2xs);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: #ffffff;
}

.receipt-qr-image {
  display: block;
  width: 148px;
  height: 148px;
  border: none;
  border-radius: var(--radius-xs);
  background: #ffffff;
}

.receipt-qr-tip {
  color: var(--text-secondary);
  font-size: var(--fs-caption-up);
}

@media (max-width: 767px) {
  .stub-code-row {
    align-items: stretch;
    flex-direction: column;
    gap: var(--space-2xs);
  }
}
</style>
