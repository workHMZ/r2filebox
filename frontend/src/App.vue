<template>
  <el-config-provider :locale="elementPlusLocale">
    <a class="skip-link" href="#main-content" @click.prevent="focusMainContent">
      {{ t('a11y.skipToMain') }}
    </a>
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import en from 'element-plus/es/locale/lang/en'
import ja from 'element-plus/es/locale/lang/ja'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { locale, t } from '@/i18n'
import { useConfigStore } from '@/stores/config'

const route = useRoute()
const configStore = useConfigStore()
const elementPlusLocale = computed(() => {
  if (locale.value === 'zh') return zhCn
  if (locale.value === 'ja') return ja
  return en
})
const siteName = computed(() => configStore.siteName())

void configStore.fetchConfig()

const focusMainContent = () => {
  document.getElementById('main-content')?.focus({ preventScroll: false })
}

watch(
  [() => route.meta.titleKey, locale, siteName],
  () => {
    const titleKey = route.meta.titleKey as string | undefined
    document.title = titleKey ? `${t(titleKey)} - ${siteName.value}` : siteName.value
  },
  { immediate: true },
)

watch(
  () => route.fullPath,
  async () => {
    await nextTick()
    window.requestAnimationFrame(() => {
      focusMainContent()
    })
  },
  { flush: 'post' },
)
</script>

<style>
#app {
  width: 100%;
  height: 100%;
}
</style>
