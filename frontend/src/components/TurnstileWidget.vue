<template>
  <div class="turnstile-field" role="group" :aria-label="t('a11y.turnstileChallenge')">
    <div ref="containerRef" class="turnstile-container"></div>
    <p v-if="loadError || !siteKey" class="turnstile-error" role="alert">{{ t('turnstile.loadFailed') }}</p>
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ statusMessage }}</p>
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
const statusMessage = ref('')
let renderGeneration = 0

const renderWidget = async () => {
  const generation = ++renderGeneration
  emit('verify', '')
  removeWidget()
  loadError.value = false
  if (!props.siteKey) {
    statusMessage.value = ''
    return
  }
  if (!containerRef.value) return
  statusMessage.value = t('a11y.turnstileLoading')

  try {
    await loadTurnstile()
    await nextTick()
    if (generation !== renderGeneration) return
    if (!window.turnstile || !containerRef.value) throw new Error('Turnstile unavailable')

    widgetId.value = window.turnstile.render(containerRef.value, {
      sitekey: props.siteKey,
      action: props.action,
      language: locale.value === 'zh' ? 'zh-CN' : locale.value === 'ja' ? 'ja' : 'en',
      theme: 'light',
      callback: (token: string) => {
        if (generation !== renderGeneration) return
        statusMessage.value = t('a11y.turnstileVerified')
        emit('verify', token)
      },
      'expired-callback': () => {
        if (generation !== renderGeneration) return
        statusMessage.value = t('a11y.turnstileExpired')
        emit('verify', '')
      },
      'error-callback': () => {
        if (generation !== renderGeneration) return
        statusMessage.value = t('a11y.turnstileVerificationFailed')
        emit('verify', '')
      },
    })
    if (generation === renderGeneration) statusMessage.value = ''
  } catch (error) {
    if (generation !== renderGeneration) return
    console.error('Turnstile widget failed to load:', error)
    loadError.value = true
    statusMessage.value = ''
    emit('verify', '')
  }
}

const reset = () => {
  emit('verify', '')
  statusMessage.value = ''
  if (widgetId.value && window.turnstile) {
    window.turnstile.reset(widgetId.value)
  }
}

const removeWidget = () => {
  if (widgetId.value && window.turnstile) {
    window.turnstile.remove(widgetId.value)
  }
  widgetId.value = null
}

watch(() => props.siteKey, renderWidget)
watch(locale, renderWidget)
onMounted(renderWidget)

onBeforeUnmount(() => {
  renderGeneration++
  removeWidget()
})

defineExpose({ reset })

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (window.__r2fileboxTurnstileScript) return window.__r2fileboxTurnstileScript

  const loadPromise = new Promise<void>((resolve, reject) => {
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

  window.__r2fileboxTurnstileScript = loadPromise.catch((error) => {
    window.__r2fileboxTurnstileScript = undefined
    document.querySelector('script[data-r2filebox-turnstile]')?.remove()
    throw error
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
