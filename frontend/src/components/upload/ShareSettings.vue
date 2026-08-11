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

    <div
      :class="['setting-row', 'setting-row--guide', { 'setting-row--warning': showSecurityTip }]"
      role="note"
      :aria-labelledby="`${idPrefix}-guide-label`"
    >
      <div :id="`${idPrefix}-guide-label`" class="setting-title">
        <el-icon class="label-icon" aria-hidden="true"><Lock /></el-icon>
        {{ t(showSecurityTip ? 'upload.securityTipTitle' : 'upload.shareGuideTitle') }}
      </div>
      <p class="share-guide">
        {{ t(showSecurityTip ? 'upload.securityTip' : 'upload.shareGuide') }}
      </p>
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
  showSecurityTip?: boolean
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
  --settings-control-width: 300px;
  display: grid;
  margin-bottom: 22px;
  padding: 20px 0 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 10px 24px;
  border-top: 1px solid var(--border-subtle);
}

.setting-row {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 10px;
  text-align: left;
}

.setting-row--guide {
  width: min(100%, var(--settings-control-width));
  max-width: 100%;
  justify-self: end;
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

.setting-row--warning .setting-title,
.setting-row--warning .label-icon {
  color: var(--warning-color);
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

.share-guide {
  display: flex;
  width: 100%;
  max-width: 100%;
  min-height: 40px;
  margin: 0;
  padding: 7px 12px;
  align-items: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-page);
  color: var(--glass-text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.setting-row--warning .share-guide {
  border-color: var(--warning-border);
  background: var(--warning-soft);
  color: var(--warning-color);
}


@media (max-width: 640px) {
  .upload-settings-panel {
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }

  .expire-inputs,
  .share-guide {
    width: 100%;
  }

  .setting-row--guide {
    width: 100%;
    justify-self: stretch;
  }

  .expire-inputs {
    grid-template-columns: minmax(0, 1fr) minmax(96px, 112px);
  }
}
</style>
