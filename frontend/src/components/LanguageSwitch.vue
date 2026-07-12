<template>
  <div :class="['language-switch', { inline }]">
    <el-icon class="language-icon" aria-hidden="true"><Guide /></el-icon>
    <el-select v-model="selectedLocale" size="small" class="language-select">
      <el-option
        v-for="option in languageOptions"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Guide } from '@element-plus/icons-vue'
import { locale, languageOptions, setLocale, type Locale } from '@/i18n'

defineProps<{
  inline?: boolean
}>()

const selectedLocale = computed({
  get: () => locale.value,
  set: (value: Locale) => setLocale(value),
})
</script>

<style scoped>
.language-switch {
  display: inline-flex;
  height: 38px;
  align-items: center;
  gap: 4px;
  padding-left: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: #ffffff;
  color: var(--text-secondary);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.language-switch:hover,
.language-switch:focus-within {
  border-color: var(--border-strong);
}

.language-switch:focus-within {
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.language-icon {
  flex: 0 0 auto;
  font-size: 16px;
}

.language-select {
  width: 108px;
}

.language-select :deep(.el-select__wrapper) {
  min-height: 36px !important;
  padding-left: 4px !important;
  border: 0 !important;
  background: transparent !important;
}

.language-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: none !important;
}
</style>
