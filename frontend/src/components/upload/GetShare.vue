<template>
  <div class="get-share-container">
    <div class="input-section">
      <div class="lookup-row">
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
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Key, Download, HelpFilled } from '@element-plus/icons-vue'
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
  padding: 8px 0 0;
}

.input-section {
  margin: 8px 0 36px;
}

.lookup-row {
  display: flex;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  align-items: stretch;
  gap: 10px;
}

.code-input {
  flex: 1;
}

.code-input :deep(.el-input__wrapper) {
  min-height: 50px !important;
  padding: 10px 16px !important;
  font-size: 16px !important;
}

.input-key-icon {
  font-size: 18px;
  color: var(--primary-color);
}

.get-btn {
  width: 150px;
  height: 50px;
  flex: 0 0 150px;
  font-size: 15px;
  font-weight: 700;
  border-radius: var(--radius-md);
}

.tips-section {
  max-width: 540px;
  margin: 0 auto;
}

.tips-card {
  padding: 20px 0 0;
  border-top: 1px solid var(--border-subtle);
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
  color: var(--accent-color);
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

@media (max-width: 560px) {
  .lookup-row {
    flex-direction: column;
  }

  .get-btn {
    width: 100%;
    flex-basis: 50px;
  }
}
</style>
