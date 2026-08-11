import { computed, ref } from 'vue'

export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'r2filebox-theme'
const LIGHT_THEME_COLOR = '#086f68'
const DARK_THEME_COLOR = '#0b1115'

const resolvedThemeState = ref<ResolvedTheme>(
  document.documentElement.classList.contains('dark') ? 'dark' : 'light',
)
const hasManualPreference = ref(false)
let initialized = false
let systemThemeQuery: MediaQueryList | null = null

export const resolvedTheme = computed<ResolvedTheme>(() => resolvedThemeState.value)
export const isDark = computed(() => resolvedThemeState.value === 'dark')

export function initTheme() {
  if (initialized) return

  systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const savedTheme = readStoredTheme()
  hasManualPreference.value = savedTheme !== null
  applyTheme(savedTheme ?? systemTheme())

  systemThemeQuery.addEventListener('change', handleSystemThemeChange)
  window.addEventListener('storage', handleStorageChange)
  initialized = true
}

export function setTheme(theme: ResolvedTheme) {
  hasManualPreference.value = true
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Keep the manual choice for this tab when storage is unavailable.
  }
  applyTheme(theme)
}

export function toggleTheme() {
  setTheme(isDark.value ? 'light' : 'dark')
}

export function destroyTheme() {
  if (!initialized) return
  systemThemeQuery?.removeEventListener('change', handleSystemThemeChange)
  window.removeEventListener('storage', handleStorageChange)
  initialized = false
}

export function useTheme() {
  return {
    theme: resolvedTheme,
    resolvedTheme,
    isDark,
    setTheme,
    toggleTheme,
    destroyTheme,
  }
}

function systemTheme(): ResolvedTheme {
  return systemThemeQuery?.matches ? 'dark' : 'light'
}

function applyTheme(theme: ResolvedTheme) {
  const dark = theme === 'dark'
  resolvedThemeState.value = theme
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = theme

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  themeColor?.setAttribute('content', dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}

function readStoredTheme(): ResolvedTheme | null {
  try {
    const savedTheme = localStorage.getItem(STORAGE_KEY)
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : null
  } catch {
    return null
  }
}

function handleSystemThemeChange(event: MediaQueryListEvent) {
  if (!hasManualPreference.value) applyTheme(event.matches ? 'dark' : 'light')
}

function handleStorageChange(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return

  const storedTheme = event.newValue === 'light' || event.newValue === 'dark'
    ? event.newValue
    : null
  hasManualPreference.value = storedTheme !== null
  applyTheme(storedTheme ?? systemTheme())
}
