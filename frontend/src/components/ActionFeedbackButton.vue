<template>
  <el-button
    v-bind="$attrs"
    :type="success ? 'success' : type"
    :size="size"
    :loading="loading"
    :disabled="disabled"
    :aria-busy="loading || undefined"
    :class="['action-feedback-button', { 'is-success-feedback': success }]"
  >
    <el-icon v-if="!loading && (success || icon)" aria-hidden="true">
      <Transition name="action-icon" mode="out-in">
        <component
          :is="success ? Check : icon"
          :key="success ? 'checked' : 'idle'"
        />
      </Transition>
    </el-icon>
    <slot />
  </el-button>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { Check } from '@element-plus/icons-vue'

defineOptions({ inheritAttrs: false })

type ButtonType = '' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
type ButtonSize = '' | 'large' | 'small'

withDefaults(defineProps<{
  type?: ButtonType
  size?: ButtonSize
  icon?: Component
  loading?: boolean
  success?: boolean
  disabled?: boolean
}>(), {
  type: '',
  size: '',
  icon: undefined,
  loading: false,
  success: false,
  disabled: false,
})
</script>

<style scoped>
.action-feedback-button {
  transition:
    color 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.action-feedback-button :deep(.el-icon) {
  margin-right: 7px;
}

.action-feedback-button.is-success-feedback {
  --el-button-text-color: var(--success-color);
  --el-button-bg-color: #edf8f1;
  --el-button-border-color: #a8d9b9;
  --el-button-hover-text-color: var(--success-color);
  --el-button-hover-bg-color: #edf8f1;
  --el-button-hover-border-color: #8bcda2;
  --el-button-active-text-color: var(--success-color);
  --el-button-active-bg-color: #e3f4e9;
  --el-button-active-border-color: #8bcda2;
}

.action-icon-enter-active,
.action-icon-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.action-icon-enter-from,
.action-icon-leave-to {
  opacity: 0;
  transform: scale(0.68);
}

@media (prefers-reduced-motion: reduce) {
  .action-feedback-button,
  .action-icon-enter-active,
  .action-icon-leave-active {
    transition: none;
  }
}
</style>
