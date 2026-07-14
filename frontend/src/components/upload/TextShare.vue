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

    <ShareSettings
      id-prefix="text-share"
      v-model:expire-value="form.expire_value"
      v-model:expire-style="form.expire_style"
    />

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
      class="text-share-submit"
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
import { Promotion } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'
import { useConfigStore } from '@/stores/config'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import ShareSettings from '@/components/upload/ShareSettings.vue'

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

.text-share-submit {
  width: 100%;
  height: 52px;
  font-size: 16px;
  font-weight: 700;
  border-radius: var(--radius-md);
}

</style>
