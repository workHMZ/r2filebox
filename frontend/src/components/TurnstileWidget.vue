<template>
  <div class="turnstile-field">
    <div ref="containerRef" class="turnstile-container"></div>
    <p v-if="loadError || !siteKey" class="turnstile-error" role="alert">{{ t('turnstile.loadFailed') }}</p>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { locale, useI18n } from '@/i18n'

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
    __r2fileboxTurnstileScript?: Promise<void>
  }
}

const props = defineProps<{
  siteKey: string
  action: 'file-share' | 'text-share'
}>()

const emit = defineEmits<{
  verify: [token: string]
}>()

const { t } = useI18n()
const containerRef = ref<HTMLElement | null>(null)
const widgetId = ref<string | null>(null)
const loadError = ref(false)

const renderWidget = async () => {
  if (!props.siteKey || !containerRef.value) return
  loadError.value = false

  try {
    await loadTurnstile()
    await nextTick()
    if (!window.turnstile || !containerRef.value) throw new Error('Turnstile unavailable')
    if (widgetId.value) window.turnstile.remove(widgetId.value)

    widgetId.value = window.turnstile.render(containerRef.value, {
      sitekey: props.siteKey,
      action: props.action,
      language: locale.value === 'zh' ? 'zh-CN' : locale.value === 'ja' ? 'ja' : 'en',
      theme: 'light',
      callback: (token: string) => emit('verify', token),
      'expired-callback': () => emit('verify', ''),
      'error-callback': () => emit('verify', ''),
    })
  } catch (error) {
    console.error('Turnstile widget failed to load:', error)
    loadError.value = true
    emit('verify', '')
  }
}

const reset = () => {
  emit('verify', '')
  if (widgetId.value && window.turnstile) {
    window.turnstile.reset(widgetId.value)
  }
}

watch(() => props.siteKey, renderWidget)
watch(locale, renderWidget)
onMounted(renderWidget)

onBeforeUnmount(() => {
  if (widgetId.value && window.turnstile) {
    window.turnstile.remove(widgetId.value)
  }
})

defineExpose({ reset })

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (window.__r2fileboxTurnstileScript) return window.__r2fileboxTurnstileScript

  window.__r2fileboxTurnstileScript = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-r2filebox-turnstile]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.r2fileboxTurnstile = 'true'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Turnstile script failed')), { once: true })
    document.head.appendChild(script)
  })

  return window.__r2fileboxTurnstileScript
}
</script>

<style scoped>
.turnstile-field {
  display: flex;
  min-height: 68px;
  margin: 0 0 20px;
  align-items: center;
  justify-content: center;
}

.turnstile-container {
  min-height: 65px;
}

.turnstile-error {
  margin: 0;
  color: var(--danger-color);
  font-size: 13px;
}

@media (max-width: 360px) {
  .turnstile-field {
    overflow-x: auto;
    justify-content: flex-start;
  }
}
</style>
