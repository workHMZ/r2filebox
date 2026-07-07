<template>
  <div :class="['language-switch', { inline }]" aria-label="Language">
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
  position: fixed;
  top: 16px;
  right: 18px;
  z-index: 50;
}

.language-switch.inline {
  position: static;
  z-index: auto;
}

.language-select {
  width: 116px;
}

@media (max-width: 768px) {
  .language-switch {
    top: 10px;
    right: 10px;
  }
}
</style>
