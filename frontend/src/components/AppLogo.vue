<template>
  <span :class="['app-logo', `app-logo--${size}`]" aria-hidden="true">
    <img :src="isDark ? '/app-logo-dark.png' : '/app-icon-192.png'" alt="" class="app-logo__img" />
  </span>
</template>

<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'

withDefaults(defineProps<{
  size?: 'small' | 'medium' | 'large'
}>(), {
  size: 'medium',
})

const { isDark } = useTheme()
</script>

<style scoped>
.app-logo {
  --logo-size: 42px;
  --logo-icon-size: 22px;
  position: relative;
  display: inline-flex;
  width: var(--logo-size);
  height: var(--logo-size);
  flex: 0 0 var(--logo-size);
  align-items: center;
  justify-content: center;
  border: 1px solid var(--primary-border);
  border-radius: 10px;
  background: var(--surface-muted);
  overflow: hidden;
  color: var(--text-primary);
  box-shadow: var(--glass-shadow);
}

.app-logo__img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}

.app-logo--small {
  --logo-size: 36px;
  --logo-icon-size: 19px;
  border-radius: 9px;
}

.app-logo--large {
  --logo-size: 58px;
  --logo-icon-size: 30px;
  border-radius: 13px;
}
</style>
