<template>
  <span :class="['app-logo', `app-logo--${size}`]" aria-hidden="true">
    <el-icon><Box /></el-icon>
    <span class="app-logo__accent"></span>
  </span>
</template>

<script setup lang="ts">
import { Box } from '@element-plus/icons-vue'

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
  border: 1px solid #075f5a;
  border-radius: 10px;
  background: var(--primary-color);
  color: #ffffff;
  box-shadow: 0 7px 18px rgba(8, 111, 104, 0.18);
}

.app-logo .el-icon {
  font-size: var(--logo-icon-size);
}

.app-logo__accent {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background: var(--accent-color);
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
