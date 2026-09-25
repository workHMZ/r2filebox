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
            <GetShare v-if="configStore.config || configStore.loadFailed || tabChosenByUser" />
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

    <ShareReceipt
      v-if="shareResult"
      v-model="showShareDialog"
      :result="shareResult"
      @closed="handleDialogClosed"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { Link } from '@element-plus/icons-vue'

import { useConfigStore } from '@/stores/config'
import AppLogo from '@/components/AppLogo.vue'
import InterfaceControls from '@/components/InterfaceControls.vue'
import type { ShareCreatedResult } from '@/api/share'
import { useI18n } from '@/i18n'

const ShareReceipt = defineAsyncComponent(() => import('@/components/ShareReceipt.vue'))
const FileUpload = defineAsyncComponent(() => import('@/components/upload/FileUpload.vue'))
const TextShare = defineAsyncComponent(() => import('@/components/upload/TextShare.vue'))
const GetShare = defineAsyncComponent(() => import('@/components/upload/GetShare.vue'))

const configStore = useConfigStore()
const { t } = useI18n()

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
const shareResult = ref<ShareCreatedResult | null>(null)

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

const handleShareSuccess = (result: ShareCreatedResult) => {
  shareResult.value = result
  showShareDialog.value = true
  triggerShareSuccessHaptic()
}

const handleDialogClosed = () => {
  document
    .querySelector<HTMLElement>('.function-tabs .el-tabs__item[aria-selected="true"]')
    ?.focus()
}
</script>

<style scoped>
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

}
</style>
