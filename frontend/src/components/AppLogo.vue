<template>
  <span :class="['app-logo', `app-logo--${size}`]" aria-hidden="true">
    <!-- 纯矢量 SVG 品牌 Logo：等轴测安全仓 + 悬浮 R2 对象存储桶 (Concept A-1) -->
    <svg viewBox="0 0 48 48" fill="none" class="app-logo__svg">
      <!-- 外层等轴测折纸仓体 (Origami Vault Cube) -->
      <path
        d="M24 4L42 14.5V33.5L24 44L6 33.5V14.5L24 4Z"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      <!-- 内部空间轴向发丝线 (向中心汇聚，承托 R2 存储桶) -->
      <path
        d="M24 4V12.5M24 33.5V44M6 14.5L14.5 19.5M42 14.5L33.5 19.5"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-opacity="0.35"
      />
      <!-- 中央核心：极简 R2 存储桶 (R2 Object Bucket) -->
      <path
        d="M16 17.5V28.5C16 30.8 19.58 32 24 32C28.42 32 32 30.8 32 28.5V17.5"
        stroke="var(--primary-color, #cc785c)"
        stroke-width="2"
        stroke-linecap="round"
      />
      <ellipse
        cx="24"
        cy="17.5"
        rx="8"
        ry="2.8"
        stroke="var(--primary-color, #cc785c)"
        stroke-width="2"
      />
      <!-- 存储分块数据环 -->
      <path
        d="M16.4 22.8C17.6 24.5 20.6 25.5 24 25.5C27.4 25.5 30.4 24.5 31.6 22.8"
        stroke="var(--primary-color, #cc785c)"
        stroke-width="1.4"
        stroke-linecap="round"
      />
      <!-- 激光微蚀刻极简字标：R2 -->
      <path
        d="M20 25.8V29.5M20 25.8H21.6C22.4 25.8 22.8 26.3 22.8 27C22.8 27.7 22.4 28.1 21.6 28.1H20M21.5 28.1L22.9 29.5"
        stroke="var(--primary-color, #cc785c)"
        stroke-width="1.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M25 26.2C25 25.7 25.5 25.5 26.2 25.5C27 25.5 27.4 26 27.4 26.6C27.4 27.7 25 28.3 25 29.5H27.5"
        stroke="var(--primary-color, #cc785c)"
        stroke-width="1.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
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
  --logo-size: 40px;
  --logo-icon-size: 26px;
  position: relative;
  display: inline-flex;
  width: var(--logo-size);
  height: var(--logo-size);
  flex: 0 0 var(--logo-size);
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.app-logo__svg {
  width: var(--logo-icon-size);
  height: var(--logo-icon-size);
  display: block;
}

.app-logo--small {
  --logo-size: 34px;
  --logo-icon-size: 22px;
  border-radius: var(--radius-sm);
}

.app-logo--large {
  --logo-size: 52px;
  --logo-icon-size: 34px;
  border-radius: var(--radius-lg);
}
</style>
