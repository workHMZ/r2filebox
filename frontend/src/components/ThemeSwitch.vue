<template>
  <button
    type="button"
    class="theme-switch"
    :aria-label="toggleLabel"
    :aria-pressed="isDark"
    :title="toggleLabel"
    @click="toggleTheme"
  >
    <el-icon aria-hidden="true">
      <Sunny v-if="isDark" />
      <Moon v-else />
    </el-icon>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Moon, Sunny } from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'
import { useI18n } from '@/i18n'

const { isDark, toggleTheme } = useTheme()
const { t } = useI18n()
const toggleLabel = computed(() => (
  isDark.value ? t('a11y.switchToLightTheme') : t('a11y.switchToDarkTheme')
))
</script>

<style scoped>
.theme-switch {
  appearance: none;
  display: inline-flex;
  width: 38px;
  height: 38px;
  padding: 0;
  flex: 0 0 38px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--control-border);
  border-radius: var(--radius-md);
  background: var(--surface-card-solid);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 17px;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.theme-switch:hover {
  border-color: var(--control-border-hover);
  background: var(--surface-page);
  color: var(--primary-color);
}

.theme-switch:focus-visible {
  outline: 3px solid var(--primary-color);
  outline-offset: 3px;
}

@media (max-width: 460px) {
  .theme-switch {
    width: 38px;
    flex-basis: 38px;
  }
}
</style>
