<template>
  <div class="home-container">
    <div class="bg-decoration" aria-hidden="true"></div>

    <div class="main-wrapper">
      <header class="top-nav">
        <div class="logo-section">
          <AppLogo />
          <div class="logo-text">
            <h1>{{ configStore.siteName() }}</h1>
            <p>{{ configStore.siteDescription() }}</p>
          </div>
        </div>
        <LanguageSwitch inline />
      </header>

      <main
        id="main-content"
        class="content-area glass-card"
        tabindex="-1"
        aria-labelledby="home-main-title"
      >
        <div class="intro-section">
          <h2 id="home-main-title">{{ t('home.title') }}</h2>
          <p>{{ t('home.subtitle') }}</p>
        </div>

        <el-tabs v-model="activeTab" class="function-tabs">
          <el-tab-pane name="file">
            <template #label>
              <span class="tab-label">
                <el-icon><Upload /></el-icon>
                {{ t('home.tab.file') }}
              </span>
            </template>
            <FileUpload @success="handleShareSuccess" />
          </el-tab-pane>

          <el-tab-pane name="text">
            <template #label>
              <span class="tab-label">
                <el-icon><Document /></el-icon>
                {{ t('home.tab.text') }}
              </span>
            </template>
            <TextShare @success="handleShareSuccess" />
          </el-tab-pane>

          <el-tab-pane name="get">
            <template #label>
              <span class="tab-label">
                <el-icon><Download /></el-icon>
                {{ t('home.tab.get') }}
              </span>
            </template>
            <GetShare />
          </el-tab-pane>
        </el-tabs>
      </main>

      <footer class="footer-section">
        <el-alert type="info" :closable="false">
          <template #title>
            <p>{{ t('home.legal') }}</p>
          </template>
        </el-alert>
        <a
          class="github-link"
          href="https://github.com/workHMZ/r2filebox"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="t('a11y.githubNewWindow')"
        >
          <el-icon><Link /></el-icon>
          {{ t('common.github') }}
        </a>
      </footer>
    </div>

    <el-dialog
      v-model="showShareDialog"
      :title="t('share.success.title')"
      width="560px"
      :close-on-click-modal="false"
      @closed="focusActiveShareTab"
    >
      <div class="share-result">
        <el-result icon="success" :title="t('share.success.title')" :sub-title="t('share.success.subtitle')">
          <template #extra>
            <div class="share-code-card">
              <div class="code-header">
                <el-icon><Key /></el-icon>
                <span>{{ t('share.code.label') }}</span>
              </div>
              <div class="code-body">
                <span class="code-text">{{ shareCode }}</span>
                <el-button type="primary" size="small" @click="copyShareCode">
                  <el-icon><CopyDocument /></el-icon>
                  {{ t('share.code.copy') }}
                </el-button>
              </div>
            </div>

            <div v-if="qrCodeDataUrl" class="qrcode-section">
              <img :src="qrCodeDataUrl" alt="" aria-hidden="true" class="qrcode-image" />
              <p class="qrcode-tip">{{ t('share.qr.tip') }}</p>
            </div>

            <div class="share-link-box">
              <el-input
                v-model="shareUrl"
                readonly
                size="large"
                :aria-label="t('a11y.shareLink')"
              >
                <template #append>
                  <el-button type="primary" @click="copyShareUrl">
                    <el-icon><CopyDocument /></el-icon>
                    {{ t('share.link.copy') }}
                  </el-button>
                </template>
              </el-input>
            </div>
          </template>
        </el-result>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import QRCode from 'qrcode'
import {
  CopyDocument,
  Document,
  Download,
  Key,
  Link,
  Upload,
} from '@element-plus/icons-vue'

import { useConfigStore } from '@/stores/config'
import AppLogo from '@/components/AppLogo.vue'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import FileUpload from '@/components/upload/FileUpload.vue'
import TextShare from '@/components/upload/TextShare.vue'
import GetShare from '@/components/upload/GetShare.vue'
import { useI18n } from '@/i18n'

const configStore = useConfigStore()
const { t } = useI18n()

const activeTab = ref('file')
const showShareDialog = ref(false)
const shareUrl = ref('')
const shareCode = ref('')
const qrCodeDataUrl = ref('')

interface ShareResult {
  code: string
  share_url: string
  full_share_url: string
  qr_code_data: string
}

const handleShareSuccess = async (result: ShareResult) => {
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
  showShareDialog.value = true

  try {
    const qrData = result.qr_code_data || url
    qrCodeDataUrl.value = await QRCode.toDataURL(qrData, {
      width: 180,
      margin: 2,
      color: {
        dark: '#182229',
        light: '#ffffff',
      },
    })
  } catch (error) {
    console.error('生成二维码失败:', error)
    qrCodeDataUrl.value = ''
  }
}

const copyShareUrl = async () => {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    ElMessage.success(t('share.link.copied'))
  } catch {
    ElMessage.error(t('shareView.copyFailed'))
  }
}

const copyShareCode = async () => {
  try {
    await navigator.clipboard.writeText(shareCode.value)
    ElMessage.success(t('share.code.copied'))
  } catch {
    ElMessage.error(t('shareView.copyFailed'))
  }
}

const focusActiveShareTab = () => {
  document
    .querySelector<HTMLElement>('.function-tabs .el-tabs__item[aria-selected="true"]')
    ?.focus()
}

onMounted(async () => {
  await configStore.fetchConfig()
})
</script>

<style scoped>
.home-container {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
}

.main-wrapper {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(100% - 40px, 960px);
  min-height: 100vh;
  margin: 0 auto;
  padding: 28px 0 24px;
  flex-direction: column;
  gap: 20px;
}

.top-nav {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 2px;
}

.logo-section {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.logo-text {
  min-width: 0;
}

.logo-text h1 {
  overflow: hidden;
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logo-text p {
  overflow: hidden;
  margin: 2px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-area {
  flex: 1;
  padding: 30px 34px 34px;
  border-top: 3px solid var(--primary-color);
}

.intro-section {
  margin-bottom: 24px;
  text-align: left;
}

.intro-section h2 {
  margin: 0 0 5px;
  color: var(--text-primary);
  font-size: 26px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.3;
}

.intro-section p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.function-tabs {
  min-height: 420px;
}

.function-tabs :deep(.el-tabs__header) {
  margin: 0 0 26px;
}

.function-tabs :deep(.el-tabs__nav-wrap::after),
.function-tabs :deep(.el-tabs__active-bar) {
  display: none;
}

.function-tabs :deep(.el-tabs__nav-scroll) {
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--surface-muted);
}

.function-tabs :deep(.el-tabs__nav) {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  float: none;
}

.function-tabs :deep(.el-tabs__item) {
  height: 40px;
  padding: 0 12px !important;
  border-radius: var(--radius-md);
  color: var(--text-secondary) !important;
  font-size: 14px !important;
  font-weight: 600 !important;
}

.function-tabs :deep(.el-tabs__item.is-active) {
  background: #ffffff;
  color: var(--primary-color) !important;
  box-shadow: 0 1px 3px rgba(17, 31, 38, 0.08);
}

.tab-label {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.share-result {
  padding: 0;
}

.share-code-card {
  display: flex;
  max-width: 420px;
  margin: 0 auto 20px;
  padding: 16px 18px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border: 1px solid var(--primary-border);
  border-radius: var(--radius-lg);
  background: var(--primary-soft);
}

.code-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--primary-active);
  font-size: 12px;
  font-weight: 700;
}

.code-body {
  display: flex;
  align-items: center;
  gap: 12px;
}

.code-text {
  color: var(--text-primary);
  font-family: var(--font-accent);
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 2px;
  line-height: 1;
}

.qrcode-section {
  width: fit-content;
  margin: 0 auto 20px;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: #ffffff;
}

.qrcode-image {
  display: block;
  width: 180px;
  height: 180px;
  border-radius: var(--radius-sm);
}

.qrcode-tip {
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.share-link-box {
  max-width: 460px;
  margin: 0 auto;
}

.footer-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 2px;
}

.footer-section :deep(.el-alert) {
  flex: 1;
  padding: 9px 12px !important;
  background: rgba(255, 255, 255, 0.72) !important;
}

.footer-section p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.github-link {
  display: inline-flex;
  min-height: 36px;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition: color 0.18s ease;
}

.github-link:hover {
  color: var(--primary-color);
}

@media (max-width: 768px) {
  .main-wrapper {
    width: min(100% - 24px, 960px);
    padding: 16px 0 18px;
    gap: 14px;
  }

  .top-nav {
    min-height: 46px;
  }

  .logo-text p {
    display: none;
  }

  .content-area {
    padding: 24px 16px 26px;
  }

  .intro-section {
    margin-bottom: 20px;
  }

  .intro-section h2 {
    font-size: 22px;
  }

  .function-tabs :deep(.el-tabs__item) {
    padding: 0 6px !important;
    font-size: 13px !important;
  }

  .tab-label {
    gap: 5px;
  }

  .share-code-card,
  .code-body {
    align-items: stretch;
    flex-direction: column;
  }

  .share-code-card {
    text-align: center;
  }

  .code-header,
  .code-body {
    justify-content: center;
  }

  .footer-section {
    align-items: stretch;
    flex-direction: column;
  }

  .github-link {
    align-self: center;
  }
}

@media (max-width: 420px) {
  .top-nav {
    gap: 8px;
  }

  .logo-text h1 {
    max-width: 100px;
  }

  .top-nav :deep(.language-switch) {
    width: 126px;
  }

  .top-nav :deep(.language-select) {
    width: 94px;
  }

  .tab-label .el-icon {
    display: none;
  }
}
</style>
