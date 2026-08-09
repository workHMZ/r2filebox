<template>
  <span :class="['app-logo', `app-logo--${size}`]" aria-hidden="true">
    <img src="/app-icon-192.png" alt="" class="app-logo__img" />
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'small' | 'medium' | 'large'
}>(), {
  size: 'medium',
})
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
  border: 1px solid rgba(8, 111, 104, 0.22);
  border-radius: 10px;
  background: #f3f6f8;
  overflow: hidden;
  color: #14212b;
  box-shadow: 0 4px 14px rgba(8, 111, 104, 0.12);
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
