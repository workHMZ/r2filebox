<template>
  <form class="text-share-container" @submit.prevent="handleShare">
    <div class="text-input-area">
      <label class="sr-only" for="text-share-content">{{ t('a11y.textContent') }}</label>
      <el-input
        id="text-share-content"
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
      <div class="setting-row" role="group" aria-labelledby="text-expire-label">
        <div id="text-expire-label" class="setting-title">
          <el-icon class="label-icon" aria-hidden="true"><Clock /></el-icon>
          {{ t('upload.expire') }}
        </div>
        <div class="expire-inputs">
          <el-input-number 
            v-model="form.expire_value" 
            :min="1"
            :max="999"
            :aria-label="t('a11y.expireValue')"
            controls-position="right"
            class="number-input"
          />
          <el-select
            v-model="form.expire_style"
            :aria-label="t('a11y.expireUnit')"
            class="expire-select"
          >
            <el-option :label="t('expire.minute')" value="minute" />
            <el-option :label="t('expire.hour')" value="hour" />
            <el-option :label="t('expire.day')" value="day" />
            <el-option :label="t('expire.week')" value="week" />
          </el-select>
        </div>
      </div>

      <div class="setting-row" role="group" aria-labelledby="text-access-label">
        <div id="text-access-label" class="setting-title">
          <el-icon class="label-icon" aria-hidden="true"><Lock /></el-icon>
          {{ t('upload.access') }}
        </div>
        <el-tag type="info" effect="plain" class="auth-mode-tag">{{ t('upload.codeAccess') }}</el-tag>
      </div>
    </div>

    <TurnstileWidget
      v-if="requiresTurnstile"
      ref="turnstileRef"
      :site-key="turnstileSiteKey"
      action="text-share"
      @verify="turnstileToken = $event"
    />

    <el-button
      type="primary"
      size="large"
      native-type="submit"
      class="share-btn"
      :loading="sharing"
      :aria-busy="sharing"
      :disabled="!textContent.trim() || (requiresTurnstile && !turnstileToken)"
    >
      <template #icon>
        <el-icon v-if="!sharing" aria-hidden="true"><Promotion /></el-icon>
      </template>
      {{ sharing ? t('text.sharing') : t('text.start') }}
    </el-button>
    <p v-if="sharing" class="sr-only" role="status" aria-live="polite">{{ t('text.sharing') }}</p>
  </form>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { shareApi } from '@/api/share'
import { ElMessage } from 'element-plus'
import { Clock, Lock, Promotion } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'
import { useConfigStore } from '@/stores/config'
import TurnstileWidget from '@/components/TurnstileWidget.vue'

const emit = defineEmits<{
  success: [result: { code: string; share_url: string; full_share_url: string; qr_code_data: string }]
}>()

const { t } = useI18n()
const configStore = useConfigStore()

const textContent = ref('')
const sharing = ref(false)
const turnstileToken = ref('')
const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)

const requiresTurnstile = computed(() => configStore.config?.requireTurnstile === true)
const turnstileSiteKey = computed(() => configStore.config?.turnstileSiteKey || '')

const form = ref({
  expire_value: 1,
  expire_style: 'day',
})

const handleShare = async () => {
  if (!textContent.value.trim()) {
    ElMessage.warning(t('text.empty'))
    return
  }

  await configStore.fetchConfig()
  if (requiresTurnstile.value && !turnstileToken.value) {
    ElMessage.warning(t('turnstile.required'))
    return
  }

  sharing.value = true

  try {
    const res = await shareApi.shareText({
      text: textContent.value,
      turnstileToken: turnstileToken.value || undefined,
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
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('text.failed'))
  } finally {
    turnstileRef.value?.reset()
    sharing.value = false
  }
}
</script>

<style scoped>
.text-share-container {
  padding: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.text-input-area {
  margin-bottom: 22px;
}

.text-area :deep(.el-textarea__inner) {
  min-height: 230px !important;
  padding: 16px !important;
  font-size: 15px !important;
  line-height: 1.7 !important;
}

.upload-settings-panel {
  display: grid;
  margin-bottom: 22px;
  padding: 20px 0 0;
  grid-template-columns: minmax(0, 1.45fr) minmax(180px, 0.55fr);
  gap: 24px;
  border-top: 1px solid var(--border-subtle);
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
  letter-spacing: 0;
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
  border-color: var(--primary-border);
  color: var(--primary-active);
  background: var(--primary-soft);
}

.share-btn {
  width: 100%;
  height: 52px;
  font-size: 16px;
  font-weight: 700;
  border-radius: var(--radius-md);
}

@media (max-width: 640px) {
  .upload-settings-panel {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .expire-inputs {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 112px;
  }

  .number-input,
  .expire-select {
    width: 100%;
  }
}
</style>
