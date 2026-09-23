import { computed, ref } from 'vue'

export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'r2filebox-theme'
const LIGHT_THEME_COLOR = '#faf9f5'
const DARK_THEME_COLOR = '#181715'

const resolvedThemeState = ref<ResolvedTheme>(
  document.documentElement.classList.contains('dark') ? 'dark' : 'light',
)
const hasManualPreference = ref(false)
let initialized = false
let systemThemeQuery: MediaQueryList | null = null
let thawHandle: ReturnType<typeof setTimeout> | null = null

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

export function useTheme() {
  return {
    resolvedTheme,
    isDark,
    setTheme,
    toggleTheme,
  }
}

function systemTheme(): ResolvedTheme {
  return systemThemeQuery?.matches ? 'dark' : 'light'
}

function applyTheme(theme: ResolvedTheme) {
  const dark = theme === 'dark'
  const root = document.documentElement
  resolvedThemeState.value = theme

  // Nothing may animate across the switch: see the note on
  // [data-theme-switching] in main.scss.
  freezeTransitions(root)
  root.classList.toggle('dark', dark)
  root.style.colorScheme = theme

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  themeColor?.setAttribute('content', dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}

function freezeTransitions(root: HTMLElement) {
  if (thawHandle !== null) clearTimeout(thawHandle)
  root.dataset.themeSwitching = ''
  // Flush the frozen state so the switch itself is the next paint.
  void root.offsetHeight

  const thaw = () => {
    if (thawHandle !== null) clearTimeout(thawHandle)
    thawHandle = null
    delete root.dataset.themeSwitching
  }
  // rAF pauses in a background tab, and a theme can be applied there through
  // the storage event, so the timer is the one that always resolves.
  requestAnimationFrame(() => requestAnimationFrame(thaw))
  thawHandle = setTimeout(thaw, 250)
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
