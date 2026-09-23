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
          :controls-position="stepperPosition"
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
      class="setting-row"
      role="note"
      :aria-labelledby="`${idPrefix}-guide-label`"
    >
      <div
        :id="`${idPrefix}-guide-label`"
        :class="['setting-title', { 'setting-title--warning': showSecurityTip }]"
      >
        <el-icon class="label-icon" aria-hidden="true"><Lock /></el-icon>
        {{ t(showSecurityTip ? 'upload.securityTipTitle' : 'upload.shareGuideTitle') }}
      </div>
      <div :class="['setting-note', { 'setting-note--warning': showSecurityTip }]">
        <p class="setting-note-text">
          {{ t(showSecurityTip ? 'upload.securityTip' : 'upload.shareGuide') }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
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

// Stacked steppers are 32x15 on touch, under the 24x24 floor in WCAG 2.5.8.
// The split layout gives each control the full 40px height of the field.
const isCompact = useMediaQuery('(max-width: 767px)')
const stepperPosition = computed(() => (isCompact.value ? '' : 'right'))

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
/* Two ruled entries on the sheet: the expiry control and the standing note.
   Both fill their own track, so the control and the note are the same width by
   construction. Capping them narrower and pushing them to opposite edges left
   a void down the middle of the panel and read as two mismatched blocks. */
.upload-settings-panel {
  display: grid;
  align-items: start;
  gap: var(--space-md) var(--space-lg);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding-top: var(--space-md);
  border-top: 1px solid var(--border-subtle);
}

.setting-row {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: var(--space-2xs);
  text-align: left;
}

.setting-title {
  display: flex;
  min-height: 20px;
  align-items: center;
  gap: var(--space-3xs);
  color: var(--text-secondary);
  font-size: var(--fs-caption-up);
  font-weight: 600;
  letter-spacing: var(--tracking-caption-up);
  line-height: 20px;
  text-transform: uppercase;
}

.label-icon {
  flex: 0 0 auto;
  color: var(--text-secondary);
}

.setting-title--warning {
  color: var(--warning-ink);
}

.setting-title--warning .label-icon {
  color: var(--warning-ink);
}

.expire-inputs {
  display: grid;
  width: 100%;
  min-width: 0;
  align-items: stretch;
  gap: var(--space-2xs);
  grid-template-columns: minmax(0, 1.15fr) minmax(96px, 1fr);
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

/* Matches the field height next to it so a one-line note sits level with the
   expiry control instead of reading as a shorter, lighter block. */
.setting-note {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  align-items: center;
  padding: var(--space-2xs) var(--space-xs);
  border-left: 2px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: var(--fs-body-sm);
  line-height: var(--leading-title);
}

.setting-note-text {
  margin: 0;
  font-size: var(--fs-body-sm);
  line-height: 1.4;
  text-align: left;
}

.setting-note--warning {
  padding: var(--space-2xs) var(--space-sm);
  border: 1px solid var(--warning-border);
  border-left: 3px solid var(--warning-color);
  border-radius: var(--radius-md);
  background: var(--warning-soft);
  color: var(--warning-ink);
}

.setting-note--warning .setting-note-text {
  color: var(--warning-ink);
}

@media (max-width: 767px) {
  .upload-settings-panel {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
