<template>
  <div class="interface-controls">
    <ThemeSwitch />
    <LanguageSwitch inline />
  </div>
</template>

<script setup lang="ts">
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import ThemeSwitch from '@/components/ThemeSwitch.vue'
</script>

<style scoped>
.interface-controls {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

@media (max-width: 460px) {
  .interface-controls {
    gap: 4px;
  }

  .interface-controls :deep(.language-switch) {
    width: 86px;
    padding-left: 4px;
  }

  .interface-controls :deep(.language-icon) {
    display: none;
  }

  .interface-controls :deep(.language-select) {
    width: 78px;
  }
}
</style>
