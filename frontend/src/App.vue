<template>
  <router-view />
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { locale, t } from '@/i18n'

const route = useRoute()

watch(
  [() => route.meta.titleKey, locale],
  () => {
    const titleKey = route.meta.titleKey as string | undefined
    document.title = titleKey ? `${t(titleKey)} - R2FileBox` : 'R2FileBox'
  },
  { immediate: true },
)
</script>

<style>
#app {
  width: 100%;
  height: 100%;
}
</style>
