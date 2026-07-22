<template>
  <div class="upload-settings-panel">
    <div class="setting-row" role="group" :aria-labelledby="`${idPrefix}-expire-label`">
      <div :id="`${idPrefix}-expire-label`" class="setting-title">
        <el-icon class="label-icon" aria-hidden="true"><Clock /></el-icon>
        {{ t('upload.expire') }}
      </div>
      <div class="expire-inputs">
        <el-input-number
          v-model="expireValue"
          :min="1"
          :max="currentMax"
          :aria-label="t('a11y.expireValue')"
          :aria-describedby="`${idPrefix}-expire-limit`"
          controls-position="right"
          class="number-input"
        />
        <el-select
          v-model="expireStyle"
          :aria-label="t('a11y.expireUnit')"
          class="expire-select"
        >
          <el-option
            v-for="style in availableStyles"
            :key="style"
            :label="t(`expire.${style}`)"
            :value="style"
          />
        </el-select>
        <p :id="`${idPrefix}-expire-limit`" class="sr-only">
          {{ t('upload.expireLimit', { value: maxExpireHours }) }}
        </p>
      </div>
    </div>

    <div class="setting-row" role="group" :aria-labelledby="`${idPrefix}-access-label`">
      <div :id="`${idPrefix}-access-label`" class="setting-title">
        <el-icon class="label-icon" aria-hidden="true"><Lock /></el-icon>
        {{ t('upload.access') }}
      </div>
      <el-tag type="info" effect="plain" class="auth-mode-tag">
        {{ t('upload.codeAccess') }}
      </el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { Clock, Lock } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'
import { maxExpireValue, type ExpireStyle } from '@/utils/expiration'

const props = defineProps<{
  idPrefix: string
  maxExpireHours: number
  expireStyles?: string[]
}>()

const expireValue = defineModel<number>('expireValue', { required: true })
const expireStyle = defineModel<ExpireStyle>('expireStyle', { required: true })
const { t } = useI18n()

const supportedStyles: ExpireStyle[] = ['minute', 'hour', 'day', 'week']
const availableStyles = computed(() => {
  const configured = props.expireStyles?.length ? props.expireStyles : supportedStyles
  return supportedStyles.filter(
    (style) => configured.includes(style) && maxExpireValue(props.maxExpireHours, style) >= 1,
  )
})
const currentMax = computed(() => Math.max(1, maxExpireValue(props.maxExpireHours, expireStyle.value)))

watch([availableStyles, currentMax], ([styles, maximum]) => {
  if (!styles.includes(expireStyle.value)) {
    expireStyle.value = styles[styles.length - 1] ?? 'minute'
    return
  }
  if (expireValue.value > maximum) expireValue.value = maximum
}, { immediate: true })
</script>

<style scoped>
.upload-settings-panel {
  --settings-control-width: 272px;
  display: grid;
  margin-bottom: 22px;
  padding: 20px 0 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 24px;
  border-top: 1px solid var(--border-subtle);
}

.setting-row {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 10px;
  text-align: left;
}

.setting-title {
  display: flex;
  min-height: 20px;
  align-items: center;
  gap: 8px;
  color: var(--glass-text-regular);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  letter-spacing: 0;
}

.label-icon {
  flex: 0 0 auto;
  color: var(--primary-color);
}

.expire-inputs {
  display: grid;
  width: min(100%, var(--settings-control-width));
  min-width: 0;
  grid-template-columns: minmax(0, 1.15fr) minmax(96px, 1fr);
  align-items: stretch;
  gap: 12px;
}

.number-input,
.expire-select {
  width: 100%;
  min-width: 0;
}

.number-input :deep(.el-input__wrapper),
.expire-select :deep(.el-select__wrapper) {
  min-height: 40px;
}

.auth-mode-tag {
  display: inline-flex;
  width: min(100%, var(--settings-control-width));
  min-height: 40px;
  height: auto;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-color: var(--primary-border);
  border-radius: var(--el-border-radius-base);
  background: var(--primary-soft);
  color: var(--primary-active);
  font-size: 14px;
  line-height: 22px;
  text-align: center;
  white-space: normal;
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

@media (max-width: 640px) {
  .upload-settings-panel {
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }

  .expire-inputs,
  .auth-mode-tag {
    width: 100%;
  }

  .expire-inputs {
    grid-template-columns: minmax(0, 1fr) minmax(96px, 112px);
  }
}
</style>
