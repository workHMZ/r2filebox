<template>
  <div class="share-view-container">
    <!-- 动态背景 -->
    <div class="bg-decoration">
      <div class="circle circle1"></div>
      <div class="circle circle2"></div>
      <div class="circle circle3"></div>
    </div>

    <!-- 主容器 -->
    <div class="main-wrapper">
      <div class="glass-card">
        <!-- 加载状态 -->
        <div v-if="loading" class="loading-section">
          <el-icon class="loading-icon" :size="60"><Loading /></el-icon>
          <p>{{ t('shareView.loading') }}</p>
        </div>

        <!-- 错误状态 -->
        <div v-else-if="error" class="error-section">
          <el-result icon="error" :title="t('shareView.invalid')" :sub-title="error">
            <template #extra>
              <el-button type="primary" @click="$router.push('/')">
                <el-icon style="margin-right: 4px;"><HomeFilled /></el-icon>
                {{ t('common.home') }}
              </el-button>
            </template>
          </el-result>
        </div>

        <!-- 需要密码 -->
        <div v-else-if="needPassword" class="password-section">
          <el-result icon="warning" :title="t('shareView.passwordTitle')">
            <template #sub-title>
              <span class="password-subtitle">{{ t('shareView.passwordSubtitle') }}</span>
            </template>
            <template #extra>
              <div class="password-input-box">
                <el-input
                  v-model="password"
                  type="password"
                  :placeholder="t('shareView.passwordPlaceholder')"
                  show-password
                  size="large"
                  @keyup.enter="fetchShareWithPassword"
                  class="pwd-input"
                >
                  <template #prefix>
                    <el-icon><Lock /></el-icon>
                  </template>
                </el-input>
                <el-button 
                  type="primary" 
                  size="large"
                  @click="fetchShareWithPassword" 
                  :loading="loading"
                  class="verify-btn"
                >
                  {{ t('shareView.verify') }}
                </el-button>
              </div>
            </template>
          </el-result>
        </div>

        <!-- 分享内容 -->
        <div v-else-if="shareData" class="content-section">
          <!-- 头部 -->
          <div class="share-header">
            <div class="logo-section">
              <div class="logo-icon">
                <el-icon size="28"><Box /></el-icon>
              </div>
              <div class="logo-text">
                <h1>{{ t('shareView.header') }}</h1>
                <p>{{ t('shareView.codePrefix') }}: <span class="badge-code">{{ shareCode }}</span></p>
              </div>
            </div>
            <el-button class="home-btn" @click="$router.push('/')">
              <el-icon><HomeFilled /></el-icon>
              {{ t('common.home') }}
            </el-button>
          </div>

          <el-divider class="glass-divider" />

          <!-- 文本分享 -->
          <div v-if="shareData.text" class="text-share-content">
            <div class="content-label">
              <el-icon><Document /></el-icon>
              <span>{{ t('shareView.textContent') }}</span>
            </div>
            <div class="text-box">
              <pre>{{ shareData.text }}</pre>
            </div>
            <div class="actions">
              <el-button type="primary" size="large" @click="copyText">
                <el-icon><CopyDocument /></el-icon>
                {{ t('shareView.copyText') }}
              </el-button>
            </div>
          </div>

          <!-- 文件分享 -->
          <div v-else-if="shareData.name || shareData.file_name" class="file-share-content">
            <div class="file-card">
              <div class="file-icon">
                <div class="icon-glow-ring">
                  <el-icon :size="54"><Folder /></el-icon>
                </div>
              </div>
              <div class="file-info">
                <h3 class="file-name">{{ shareData.name || shareData.file_name }}</h3>
                <div class="file-meta">
                  <el-tag type="info" size="large" class="meta-tag">
                    {{ formatFileSize(shareData.size || shareData.file_size || 0) }}
                  </el-tag>
                  <el-tag v-if="shareData.upload_type" type="success" size="large" class="meta-tag">
                    {{ shareData.upload_type === 'text' ? t('shareView.fileTypeText') : t('shareView.fileTypeBinary') }}
                  </el-tag>
                </div>
              </div>
              <el-button type="primary" size="large" class="download-btn" @click="downloadFile">
                <el-icon><Download /></el-icon>
                {{ t('shareView.downloadFile') }}
              </el-button>
            </div>
          </div>

          <!-- 分享信息 -->
          <div class="share-info">
            <div class="info-table-card">
              <div class="info-row">
                <span class="info-key">{{ t('share.code.label') }}</span>
                <span class="info-val"><el-tag class="code-tag">{{ shareCode }}</el-tag></span>
              </div>
              <div class="info-row">
                <span class="info-key">{{ t('shareView.type') }}</span>
                <span class="info-val">
                  <span class="type-indicator" :class="shareData.text ? 'text' : 'file'">
                    {{ shareData.text ? t('shareView.textType') : t('shareView.fileType') }}
                  </span>
                </span>
              </div>
              <div class="info-row" v-if="shareData.expire_time">
                <span class="info-key">{{ t('shareView.expire') }}</span>
                <span class="info-val expire-time">{{ formatTime(shareData.expire_time) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { 
  Box, HomeFilled, Document, Folder, Download, CopyDocument, Loading, Lock
} from '@element-plus/icons-vue'
import { shareApi } from '@/api/share'
import { useI18n } from '@/i18n'

const route = useRoute()
const { t } = useI18n()

const shareCode = ref('')
const loading = ref(false)
const error = ref('')
const needPassword = ref(false)
const password = ref('')
const shareData = ref<any>(null)

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatTime = (timeStr: string) => {
  if (!timeStr) return t('common.unknown')
  try {
    const d = new Date(timeStr)
    return d.toLocaleString()
  } catch {
    return timeStr
  }
}

const fetchShare = async (pwd?: string) => {
  loading.value = true
  error.value = ''
  needPassword.value = false

  try {
    const res = await shareApi.getShare(shareCode.value, pwd)

    if (res.code === 200) {
      shareData.value = res.data
    } else if (res.code === 403 || res.data?.has_password) {
      needPassword.value = true
    } else {
      error.value = res.message || t('shareView.notFound')
    }
  } catch (err: any) {
    error.value = err.message || t('shareView.networkFailed')
  } finally {
    loading.value = false
  }
}

const fetchShareWithPassword = () => {
  if (!password.value.trim()) {
    ElMessage.warning(t('shareView.passwordPlaceholder'))
    return
  }
  fetchShare(password.value)
}

const copyText = async () => {
  if (!shareData.value?.text) return
  
  try {
    await navigator.clipboard.writeText(shareData.value.text)
    ElMessage.success(t('shareView.copyDone'))
  } catch {
    ElMessage.error(t('shareView.copyFailed'))
  }
}

const downloadFile = () => {
  if (!shareCode.value) return
  
  let url = shareData.value?.download_url || `/share/download?code=${shareCode.value}`
  if (!shareData.value?.download_url && password.value) {
    url += `&password=${encodeURIComponent(password.value)}`
  }
  window.open(url, '_blank')
}

onMounted(() => {
  const code = route.params.code as string
  if (code) {
    shareCode.value = code
    fetchShare()
  } else {
    error.value = t('shareView.invalidCode')
  }
})
</script>

<style scoped>
.share-view-container {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
}

/* 主容器 */
.main-wrapper {
  position: relative;
  z-index: 1;
  max-width: 750px;
  margin: 0 auto;
  padding: 60px 20px;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.glass-card {
  width: 100%;
}

/* 加载状态 */
.loading-section {
  text-align: center;
  padding: 60px 20px;
}

.loading-icon {
  animation: spin 1s linear infinite;
  color: var(--primary-color);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.loading-section p {
  margin-top: 24px;
  font-size: 16px;
  color: var(--glass-text-secondary);
  font-weight: 500;
}

/* 密码保护 */
.password-section {
  padding: 10px;
}

.password-subtitle {
  color: var(--glass-text-secondary);
  font-size: 14px;
}

.password-input-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 360px;
  margin: 0 auto;
}

.pwd-input {
  width: 100%;
}

.pwd-input :deep(.el-input__wrapper) {
  padding: 12px 18px !important;
  font-size: 15px !important;
}

.verify-btn {
  width: 100%;
}

/* 头部 */
.share-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 16px;
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
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 118, 110, 0.18);
}

.logo-text h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
}

.logo-text p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--glass-text-secondary);
  text-align: left;
}

.badge-code {
  color: #115e59;
  font-weight: 700;
  background: #f0fdfa;
  border: 1px solid #99f6e4;
  padding: 1px 6px;
  border-radius: 4px;
}

.home-btn {
  background: #ffffff !important;
  border: 1px solid var(--border-subtle) !important;
  color: var(--text-primary) !important;
  border-radius: 12px;
  transition: all 0.3s;
}

.home-btn:hover {
  background: #f8fafc !important;
  border-color: var(--border-strong) !important;
  transform: translateY(-2px);
}

.glass-divider {
  border-color: var(--border-subtle) !important;
  margin: 0 0 28px !important;
}

/* 文本提取 */
.text-share-content {
  text-align: left;
}

.content-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  font-weight: 700;
  font-size: 15px;
  color: var(--glass-text-regular);
}

.text-box {
  background: #f8fafc;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 24px;
  margin-bottom: 24px;
  max-height: 380px;
  overflow-y: auto;
}

.text-box pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'Courier New', Courier, monospace;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary);
}

.actions {
  display: flex;
  justify-content: flex-end;
}

/* 文件提取 */
.file-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 44px 20px;
  background: #f8fafc;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  margin-bottom: 28px;
}

.file-icon {
  margin-bottom: 20px;
}

.icon-glow-ring {
  width: 96px;
  height: 96px;
  background: #ecfdf5;
  border: 1px solid #99f6e4;
  border-radius: var(--radius-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  box-shadow: 0 10px 30px rgba(15, 118, 110, 0.1);
}

@keyframes floatBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.file-info {
  text-align: center;
  margin-bottom: 28px;
  width: 100%;
}

.file-name {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.4;
  word-break: break-all;
}

.file-meta {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.meta-tag {
  font-size: 12px !important;
  padding: 2px 8px !important;
}

.download-btn {
  height: 52px;
  padding: 0 40px !important;
}

/* 分享属性信息 */
.share-info {
  margin-top: 24px;
}

.info-table-card {
  background: #ffffff;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eef2f7;
}

.info-row:last-child {
  border-bottom: none;
}

.info-key {
  font-size: 13px;
  color: var(--glass-text-secondary);
  font-weight: 500;
}

.info-val {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 600;
}

.code-tag {
  background: #f0fdfa !important;
  border-color: #99f6e4 !important;
  color: #115e59 !important;
}

.type-indicator {
  font-size: 12px;
}

.expire-time {
  color: #b45309;
  font-family: var(--font-accent);
}

/* 响应式 */
@media (max-width: 768px) {
  .main-wrapper {
    padding: 30px 12px;
  }

  .glass-card {
    padding: 24px 16px;
  }

  .share-header {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }
  
  .home-btn {
    width: 100%;
  }

  .file-card {
    padding: 32px 16px;
  }
  
  .info-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  
  .info-val {
    align-self: flex-end;
  }
}
</style>
