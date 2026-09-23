<template>
  <div class="home-page">
    <div class="ledger">
      <header class="masthead">
        <div class="masthead-brand">
          <AppLogo />
          <div class="masthead-name">
            <h1>{{ configStore.siteName }}</h1>
            <p>{{ configStore.siteDescription }}</p>
          </div>
        </div>
        <InterfaceControls />
      </header>

      <main
        id="main-content"
        class="sheet"
        tabindex="-1"
        aria-labelledby="home-main-title"
      >
        <div class="lede">
          <h2 id="home-main-title" class="display-type">{{ t('home.title') }}</h2>
          <p>{{ t('home.subtitle') }}</p>
        </div>

        <hr class="sheet-rule" />

        <el-tabs
          v-model="activeTab"
          class="function-tabs"
          :tab-position="tabPosition"
          @tab-click="tabChosenByUser = true"
        >
          <el-tab-pane v-if="fileShareEnabled" name="file" lazy>
            <template #label>
              <span class="tab-label">
                <span class="tab-index" aria-hidden="true">{{ tabIndex('file') }}</span>
                <span class="tab-name">{{ t('home.tab.file') }}</span>
              </span>
            </template>
            <FileUpload @success="handleShareSuccess" />
          </el-tab-pane>

          <el-tab-pane v-if="textShareEnabled" name="text" lazy>
            <template #label>
              <span class="tab-label">
                <span class="tab-index" aria-hidden="true">{{ tabIndex('text') }}</span>
                <span class="tab-name">{{ t('home.tab.text') }}</span>
              </span>
            </template>
            <TextShare @success="handleShareSuccess" />
          </el-tab-pane>

          <el-tab-pane name="get" lazy>
            <template #label>
              <span class="tab-label">
                <span class="tab-index" aria-hidden="true">{{ tabIndex('get') }}</span>
                <span class="tab-name">{{ t('home.tab.get') }}</span>
              </span>
            </template>
            <GetShare />
          </el-tab-pane>
        </el-tabs>
      </main>

      <footer class="colophon">
        <p class="colophon-legal">{{ t('home.legal') }}</p>
        <a
          class="colophon-link"
          href="https://github.com/workHMZ/r2filebox"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="t('a11y.githubNewWindow')"
        >
          <el-icon aria-hidden="true"><Link /></el-icon>
          {{ t('common.github') }}
        </a>
      </footer>
    </div>

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
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { CopyDocument, Link } from '@element-plus/icons-vue'

import { useConfigStore } from '@/stores/config'
import ActionFeedbackButton from '@/components/ActionFeedbackButton.vue'
import AppLogo from '@/components/AppLogo.vue'
import InterfaceControls from '@/components/InterfaceControls.vue'
import FileUpload from '@/components/upload/FileUpload.vue'
import TextShare from '@/components/upload/TextShare.vue'
import GetShare from '@/components/upload/GetShare.vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import type { ShareCreatedResult } from '@/api/share'
import { getLocaleTag, useI18n } from '@/i18n'
import { formatDateTime } from '@/utils/format'

const configStore = useConfigStore()
const { locale, t } = useI18n()

const fileShareEnabled = computed(() => {
  const config = configStore.config
  return Boolean(config && config.openUpload && config.enableFileShare !== false)
})
const textShareEnabled = computed(() => {
  const config = configStore.config
  return Boolean(config && config.openUpload && config.enableTextShare !== false)
})

// One list drives the rail order, the ledger numerals and the fallback when a
// share mode is switched off in admin, so they can never disagree.
const enabledTabs = computed(() => [
  ...(fileShareEnabled.value ? ['file'] : []),
  ...(textShareEnabled.value ? ['text'] : []),
  'get',
])
const tabIndex = (name: string) =>
  String(enabledTabs.value.indexOf(name) + 1).padStart(2, '0')

// The rail reads as a bound index on wide screens and as a tab row on phones.
const isCompact = useMediaQuery('(max-width: 767px)')
const tabPosition = computed(() => (isCompact.value ? 'top' : 'left'))

const activeTab = ref('get')
const tabChosenByUser = ref(false)
const showShareDialog = ref(false)
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

const route = useRoute()

watch(
  [enabledTabs, () => route.path],
  ([tabs, path]) => {
    if (path === '/share-target' && tabs.includes('text')) {
      activeTab.value = 'text'
      tabChosenByUser.value = true
      return
    }

    if (!tabs.includes(activeTab.value)) activeTab.value = tabs[0]
    // Landing on "get" is only the default when nothing can be shared.
    if (!tabChosenByUser.value && activeTab.value === 'get' && tabs.length > 1) {
      activeTab.value = tabs[0]
    }
  },
  { immediate: true },
)

const triggerShareSuccessHaptic = () => {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(35)
}

const handleShareSuccess = async (result: ShareCreatedResult) => {
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
  showShareDialog.value = true
  triggerShareSuccessHaptic()

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
    console.error('生成二维码失败:', error)
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
  document
    .querySelector<HTMLElement>('.function-tabs .el-tabs__item[aria-selected="true"]')
    ?.focus()
}
</script>

<style scoped>
/* viewport-fit=cover puts the page under the status bar and the home
   indicator, so the outer padding has to clear both. env() resolves to 0px
   everywhere else, which leaves the desktop rhythm untouched. */
/* viewport-fit=cover puts the page under the status bar and the home
   indicator. The safe-area guard is written once here and the breakpoints
   only retune the variables — declaring `padding` again in a media query
   would silently drop the guard on exactly the viewports that need it. */
.home-page {
  --page-inset-top: var(--space-lg);
  --page-inset-bottom: var(--space-md);
  min-height: 100vh;
  min-height: 100dvh;
  padding-block: max(var(--page-inset-top), env(safe-area-inset-top, 0px))
    max(var(--page-inset-bottom), env(safe-area-inset-bottom, 0px));
  padding-inline: 0;
  overflow-x: hidden;
}

.ledger {
  display: flex;
  min-height: calc(100dvh - var(--space-xl));
  flex-direction: column;
  gap: var(--space-md);
}

/* ---- Masthead ---------------------------------------------------------- */
.masthead {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.masthead-brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-xs);
}

.masthead-name {
  min-width: 0;
}

.masthead-name h1 {
  overflow: hidden;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: var(--fs-title-lg);
  font-weight: 600;
  letter-spacing: var(--tracking-display);
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.masthead-name p {
  overflow: hidden;
  margin-top: 2px;
  color: var(--text-secondary);
  font-family: var(--font-code);
  font-size: var(--fs-caption-up);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Lede -------------------------------------------------------------- */
.sheet {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-md);
  padding-top: var(--space-xs);
}

/* Display measure is per-script work: a line of hanzi carries far more meaning
   per em than a line of Latin, and the two scripts want different line lengths
   for the same headline. The app sets <html lang>, so :lang() can carry that.
   `balance` is deliberately avoided — on a 15-glyph line it ties between a
   7/8 and an 8/7 split and Chromium builds resolve the tie differently, which
   put the break mid-word. These measures are arithmetic instead. */
.lede h2 {
  max-width: 18em;
  color: var(--text-primary);
  font-size: var(--fs-display-md);
  line-break: strict;
  overflow-wrap: normal;
  text-wrap: pretty;
}

/* Eight hanzi per line (advance is ~0.98em), so the break lands after a word. */
:lang(zh) .lede h2 {
  max-width: 8.3em;
}

/* Kana runs longer for the same sentence; below ~9em it orphans its last word. */
:lang(ja) .lede h2 {
  max-width: 9.5em;
}

.lede p {
  max-width: 62ch;
  margin-top: var(--space-xs);
  color: var(--text-secondary);
  font-size: var(--fs-body-sm);
}

/* ---- Tab rail ---------------------------------------------------------- */
.function-tabs {
  flex: 1;
}

/* Element Plus gives a left rail no intrinsic width, so the column has to be
   bounded here. The floor keeps short labels (zh/en) from cramping the rule,
   the ceiling stops a long localisation from eating the workspace. */
.function-tabs :deep(.el-tabs__header) {
  min-width: 164px;
  max-width: 232px;
  margin: 0 var(--space-lg) 0 0;
}

.function-tabs :deep(.el-tabs__nav-wrap::after),
.function-tabs :deep(.el-tabs__active-bar) {
  display: none;
}

.function-tabs :deep(.el-tabs__nav) {
  border: 0;
}

.function-tabs :deep(.el-tabs__item) {
  height: auto;
  padding: var(--space-xs) var(--space-sm) !important;
  white-space: normal;
  border-bottom: 1px solid var(--border-subtle);
  border-left: 2px solid transparent;
  color: var(--text-secondary) !important;
  font-size: var(--fs-body-sm) !important;
  font-weight: 500 !important;
  justify-content: flex-start;
  text-align: left;
  transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.function-tabs :deep(.el-tabs__item.is-active) {
  border-left-color: var(--primary-color);
  background: var(--surface-page);
  color: var(--text-primary) !important;
  font-weight: 600 !important;
}

.function-tabs :deep(.el-tabs__content) {
  overflow: visible;
}

.tab-label {
  display: grid;
  min-width: 0;
  align-items: baseline;
  gap: var(--space-xs);
  grid-template-columns: auto minmax(0, 1fr);
  line-height: var(--leading-title);
}

.tab-index {
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-size: var(--fs-title-md);
  font-variant-numeric: lining-nums tabular-nums;
  font-weight: 500;
  letter-spacing: var(--tracking-display);
  transition: color 0.18s ease;
}

/* The active row is tinted, so the numeral steps one shade darker to keep
   4.5:1 against it. */
.is-active .tab-index {
  color: var(--primary-ink);
}

.tab-name {
  min-width: 0;
  line-break: strict;
  overflow-wrap: break-word;
  word-break: normal;
}

/* ---- Colophon ---------------------------------------------------------- */
.colophon {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--border-subtle);
}

.colophon-legal {
  max-width: 72ch;
  color: var(--text-secondary);
  font-size: var(--fs-caption-up);
  line-height: var(--leading-body);
}

.colophon-link {
  display: inline-flex;
  min-height: 32px;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-3xs);
  color: var(--text-secondary);
  font-size: var(--fs-body-sm);
  font-weight: 600;
  transition: color 0.18s ease;
}

.colophon-link:hover {
  color: var(--primary-ink);
}

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

/* ---- Breakpoints ------------------------------------------------------- */
@media (max-width: 767px) {
  .home-page {
    --page-inset-top: var(--space-sm);
    --page-inset-bottom: var(--space-sm);
  }

  .ledger {
    gap: var(--space-sm);
  }

  /* The wordmark competes with the theme and language controls for a 320px
     row, so it steps down rather than truncating to a few glyphs. */
  .masthead-name h1 {
    font-size: var(--fs-title-md);
  }

  .masthead-name p {
    display: none;
  }

  .lede h2 {
    max-width: none;
    font-size: var(--fs-display-sm);
  }

  /* Top rail: the numerals sit above the labels so three tabs still fit a
     360px viewport without the old icon-hiding hack. */
  .function-tabs :deep(.el-tabs__header) {
    min-width: 0;
    max-width: none;
    margin: 0 0 var(--space-md);
  }

  .function-tabs :deep(.el-tabs__nav) {
    display: grid;
    width: 100%;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
  }

  .function-tabs :deep(.el-tabs__item) {
    min-height: 56px;
    padding: var(--space-2xs) var(--space-3xs) !important;
    border-bottom: 2px solid var(--border-subtle);
    justify-content: center;
    text-align: center;
  }

  .function-tabs :deep(.el-tabs__item.is-active) {
    border-bottom-color: var(--primary-color);
  }

  .tab-label {
    justify-items: center;
    gap: 2px;
    grid-template-columns: minmax(0, 1fr);
  }

  .tab-index {
    font-size: var(--fs-body-sm);
  }

  .colophon {
    align-items: center;
    flex-direction: column;
    gap: var(--space-xs);
    text-align: center;
  }

  .colophon-legal {
    text-align: center;
  }

  .colophon-link {
    justify-content: center;
  }

  .stub-code-row {
    align-items: stretch;
    flex-direction: column;
    gap: var(--space-2xs);
  }
}
</style>
