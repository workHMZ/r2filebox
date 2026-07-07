<template>
  <div class="home-container">
    <!-- 动态背景 -->
    <div class="bg-decoration">
      <div class="circle circle1"></div>
      <div class="circle circle2"></div>
      <div class="circle circle3"></div>
    </div>

    <!-- 主容器 -->
    <div class="main-wrapper">
      <!-- 顶部导航 -->
      <header class="top-nav">
        <div class="logo-section">
          <div class="logo-icon">
            <el-icon size="28"><Box /></el-icon>
          </div>
          <div class="logo-text">
            <h1>{{ configStore.siteName() }}</h1>
            <p>{{ configStore.siteDescription() }}</p>
          </div>
        </div>


      </header>

      <!-- 主内容区 -->
      <main class="content-area glass-card">
        <div class="intro-section">
          <h2>{{ t('home.title') }}</h2>
          <p>{{ t('home.subtitle') }}</p>
        </div>

        <!-- 功能标签页 -->
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

      <!-- 页脚 -->
      <footer class="footer-section">
        <el-alert
          type="info"
          :closable="false"
        >
          <template #title>
            <div class="footer-content">
              <p>{{ t('home.legal') }}</p>
            </div>
          </template>
        </el-alert>
        <div class="footer-links">
          <a href="https://github.com/workHMZ/r2filebox" target="_blank" rel="noopener noreferrer">
            <el-icon><Link /></el-icon>
            {{ t('common.github') }}
          </a>
        </div>
      </footer>
    </div>

    <!-- 分享成功对话框 -->
    <el-dialog 
      v-model="showShareDialog" 
      :title="t('share.success.title')" 
      width="560px"
      :close-on-click-modal="false"
    >
      <div class="share-result">
        <el-result icon="success" :title="t('share.success.title')" :sub-title="t('share.success.subtitle')">
          <template #extra>
            <!-- 提取口令卡片 -->
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

            <!-- 二维码 -->
            <div v-if="qrCodeDataUrl" class="qrcode-section">
              <img :src="qrCodeDataUrl" :alt="t('share.qr.tip')" class="qrcode-image" />
              <p class="qrcode-tip">{{ t('share.qr.tip') }}</p>
            </div>
            
            <!-- 链接 -->
            <div class="share-link-box">
              <el-input 
                v-model="shareUrl" 
                readonly
                size="large"
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
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import QRCode from 'qrcode'
import { 
  Box, Upload, Document, Download, Link, CopyDocument, Key
} from '@element-plus/icons-vue'

import { useConfigStore } from '@/stores/config'
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
  // 确保使用正确的 hash 路由格式
  let url = result.full_share_url || result.share_url
  
  // 如果 URL 不包含 #，则添加（适配 hash 路由模式）
  if (!url.includes('#')) {
    // 如果是相对路径 /share/xxx，转换为完整 URL
    if (url.startsWith('/')) {
      url = `${window.location.origin}/#${url}`
    } else {
      // 否则在路径前添加 #
      const pathIndex = url.indexOf('/share/')
      if (pathIndex > 0) {
        url = url.substring(0, pathIndex) + '/#' + url.substring(pathIndex)
      }
    }
  }
  
  shareUrl.value = url
  shareCode.value = result.code
  showShareDialog.value = true
  
  // 生成二维码
  try {
    const qrData = result.qr_code_data || url
    qrCodeDataUrl.value = await QRCode.toDataURL(qrData, {
      width: 180,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
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
  } catch (error) {
    ElMessage.error(t('shareView.copyFailed'))
  }
}

const copyShareCode = async () => {
  try {
    await navigator.clipboard.writeText(shareCode.value)
    ElMessage.success(t('share.code.copied'))
  } catch (error) {
    ElMessage.error(t('shareView.copyFailed'))
  }
}

onMounted(async () => {
  // 加载配置
  await configStore.fetchConfig()
})
</script>

<style scoped>
.home-container {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
}

/* 主容器 */
.main-wrapper {
  position: relative;
  z-index: 1;
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 20px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 30px;
}

/* 顶部导航 */
.top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 28px;
  background: #ffffff;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: var(--glass-shadow);
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo-icon {
  width: 48px;
  height: 48px;
  background: var(--primary-gradient);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 118, 110, 0.18);
}

.logo-text h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  font-family: var(--font-accent);
  letter-spacing: 0;
}

.logo-text p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--glass-text-secondary);
}

.user-info-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 14px;
  background: #f8fafc;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.user-info-card:hover {
  background: #ffffff;
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.user-avatar {
  background: var(--accent-gradient);
  color: white;
  font-weight: 700;
}

.user-details {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.user-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}

.user-label {
  font-size: 10px;
  color: var(--glass-text-muted);
}

.login-btn {
  background: #ffffff !important;
  border: 1px solid var(--border-subtle) !important;
  color: var(--text-primary) !important;
  border-radius: 12px;
  padding: 10px 20px;
  font-weight: 600;
  font-size: 13px;
  transition: all 0.3s;
}

.login-btn:hover {
  background: #f8fafc !important;
  border-color: var(--border-strong) !important;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

/* 主内容区 */
.content-area {
  flex: 1;
}

.intro-section {
  text-align: center;
  margin-bottom: 32px;
}

.intro-section h2 {
  margin: 0 0 8px;
  font-size: 30px;
  font-weight: 800;
  background: none;
  -webkit-text-fill-color: initial;
  color: var(--text-primary);
  letter-spacing: 0;
}

.intro-section p {
  margin: 0;
  font-size: 15px;
  color: var(--glass-text-secondary);
}

/* 功能标签页 */
.function-tabs {
  margin-top: 10px;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}

/* 分享结果弹窗 */
.share-result {
  padding: 10px 0;
}

.share-code-card {
  background: #f0fdfa;
  border: 1px dashed #5eead4;
  border-radius: 16px;
  padding: 16px 24px;
  margin: 0 auto 24px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  box-shadow: 0 8px 32px rgba(15, 118, 110, 0.06);
}

.code-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #115e59;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0;
}

.code-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 8px;
}

.code-text {
  font-family: var(--font-accent);
  font-size: 32px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 3px;
  text-shadow: none;
}

.qrcode-section {
  text-align: center;
  margin: 0 auto 24px;
  padding: 16px;
  background: #ffffff;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  max-width: 212px;
}

.qrcode-image {
  width: 180px;
  height: 180px;
  border-radius: var(--radius-sm);
  display: block;
}

.qrcode-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--glass-text-secondary);
  font-weight: 500;
}

.share-link-box {
  margin-top: 16px;
  max-width: 450px;
  margin-left: auto;
  margin-right: auto;
}

/* 页脚 */
.footer-section {
  margin-top: 20px;
}

.footer-content p {
  margin: 0;
  line-height: 1.6;
  font-size: 13px;
  color: var(--glass-text-secondary);
}

.footer-links {
  margin-top: 16px;
  text-align: center;
}

.footer-links a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--glass-text-secondary);
  text-decoration: none;
  font-size: 13px;
  transition: all 0.3s;
}

.footer-links a:hover {
  color: var(--primary-color);
  transform: translateY(-1px);
}

/* 响应式 */
@media (max-width: 768px) {
  .main-wrapper {
    padding: 20px 12px;
    gap: 20px;
  }

  .top-nav {
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    align-items: center;
    text-align: center;
  }

  .content-area {
    padding: 24px 16px;
  }

  .intro-section h2 {
    font-size: 24px;
  }

  :deep(.el-tabs__item) {
    padding: 0 16px;
  }
  
  .code-body {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
