<template>
  <div class="text-share-container">
    <div class="text-input-area">
      <el-input
        v-model="textContent"
        type="textarea"
        :rows="8"
        :placeholder="t('text.placeholder')"
        resize="none"
        class="text-area"
        maxlength="10000"
        show-word-limit
      />
    </div>

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
      class="share-btn"
      :loading="sharing"
      :disabled="!textContent.trim()"
      @click="handleShare"
    >
      <template #icon>
        <el-icon v-if="!sharing"><Promotion /></el-icon>
      </template>
      {{ sharing ? t('text.sharing') : t('text.start') }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { shareApi } from '@/api/share'
import { ElMessage } from 'element-plus'
import { Clock, Lock, Promotion } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'

const emit = defineEmits<{
  success: [result: { code: string; share_url: string; full_share_url: string; qr_code_data: string }]
}>()

const { t } = useI18n()

const textContent = ref('')
const sharing = ref(false)

const form = ref({
  expire_value: 1,
  expire_style: 'day',
})

const handleShare = async () => {
  if (!textContent.value.trim()) {
    ElMessage.warning(t('text.empty'))
    return
  }

  sharing.value = true

  try {
    const res = await shareApi.shareText({
      text: textContent.value,
      ...form.value,
    })

    if (res.code === 200) {
      ElMessage.success(t('text.done'))
      
      emit('success', {
        code: res.data.code,
        share_url: res.data.share_url,
        full_share_url: res.data.full_share_url,
        qr_code_data: res.data.qr_code_data,
      })
      
      // 重置
      textContent.value = ''
    } else {
      throw new Error(res.message || t('text.failed'))
    }
  } catch (error: any) {
    ElMessage.error(error.message || t('text.failed'))
  } finally {
    sharing.value = false
  }
}
</script>

<style scoped>
.text-share-container {
  padding: 10px 0;
}

.text-input-area {
  margin-bottom: 24px;
}

.text-area :deep(.el-textarea__inner) {
  font-size: 15px !important;
  line-height: 1.6 !important;
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

.share-btn {
  width: 100%;
  height: 52px;
  font-size: 16px;
  font-weight: 700;
  border-radius: var(--radius-md);
}
</style>
