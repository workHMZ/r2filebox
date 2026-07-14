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
          :max="999"
          :aria-label="t('a11y.expireValue')"
          controls-position="right"
          class="number-input"
        />
        <el-select
          v-model="expireStyle"
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
import { Clock, Lock } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'

defineProps<{
  idPrefix: string
}>()

const expireValue = defineModel<number>('expireValue', { required: true })
const expireStyle = defineModel<string>('expireStyle', { required: true })
const { t } = useI18n()
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
