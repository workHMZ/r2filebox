<template>
  <div class="get-share-container">
    <div class="input-section">
      <div class="input-icon">
        <div class="icon-ring">
          <el-icon size="42"><Search /></el-icon>
        </div>
      </div>
      <el-input
        v-model="shareCode"
        size="large"
        :placeholder="t('get.placeholder')"
        class="code-input"
        clearable
        @keyup.enter="handleGetShare"
      >
        <template #prefix>
          <el-icon class="input-key-icon"><Key /></el-icon>
        </template>
      </el-input>
      <el-button
        type="primary"
        size="large"
        class="get-btn"
        @click="handleGetShare"
      >
        <template #icon>
          <el-icon><Download /></el-icon>
        </template>
        {{ t('get.button') }}
      </el-button>
    </div>

    <div class="tips-section">
      <div class="tips-card">
        <p class="tips-title">
          <el-icon class="tip-spark"><HelpFilled /></el-icon>
          {{ t('get.tips.title') }}
        </p>
        <ul class="tips-list">
          <li>{{ t('get.tips.one') }}</li>
          <li>{{ t('get.tips.two') }}</li>
          <li>{{ t('get.tips.three') }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Key, Download, HelpFilled } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'

interface Props {
  initialCode?: string
}

const props = defineProps<Props>()
const router = useRouter()
const { t } = useI18n()

const shareCode = ref('')

// 监听 initialCode 变化
watch(() => props.initialCode, (newCode) => {
  if (newCode) {
    shareCode.value = newCode
    handleGetShare()
  }
}, { immediate: true })

// 组件挂载时检查
onMounted(() => {
  if (props.initialCode) {
    shareCode.value = props.initialCode
    handleGetShare()
  }
})

const handleGetShare = () => {
  if (!shareCode.value.trim()) {
    ElMessage.warning(t('get.empty'))
    return
  }

  // 跳转到分享查看页面
  router.push(`/share/${shareCode.value.trim()}`)
}
</script>

<style scoped>
.get-share-container {
  padding: 10px 0;
}

.input-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  margin-bottom: 40px;
}

.input-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-ring {
  width: 80px;
  height: 80px;
  background: #ecfdf5;
  border: 1px solid #99f6e4;
  border-radius: var(--radius-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  box-shadow: 0 10px 28px rgba(15, 118, 110, 0.1);
}

.code-input {
  width: 100%;
  max-width: 480px;
}

.code-input :deep(.el-input__wrapper) {
  padding: 14px 20px !important;
  font-size: 16px !important;
}

.input-key-icon {
  font-size: 18px;
  color: var(--primary-color);
}

.get-btn {
  width: 100%;
  max-width: 480px;
  height: 52px;
  font-size: 16px;
  font-weight: 700;
  border-radius: var(--radius-md);
  margin-top: 4px;
}

.tips-section {
  max-width: 540px;
  margin: 0 auto;
}

.tips-card {
  background: #f8fafc;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 24px;
  text-align: left;
}

.tips-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.tip-spark {
  color: #fbbf24;
}

.tips-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tips-list li {
  font-size: 13px;
  color: var(--glass-text-secondary);
  line-height: 1.6;
}

.tips-list li strong {
  color: var(--primary-color);
}
</style>
