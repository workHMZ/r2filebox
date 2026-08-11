(() => {
  const storageKey = 'r2filebox-theme'
  const root = document.documentElement
  let savedTheme = null

  try {
    const storedValue = localStorage.getItem(storageKey)
    if (storedValue === 'light' || storedValue === 'dark') savedTheme = storedValue
  } catch {
    // System preference remains available when storage is blocked.
  }

  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light')
  const dark = theme === 'dark'

  root.classList.toggle('dark', dark)
  root.style.colorScheme = theme

  const themeColor = document.querySelector('meta[name="theme-color"]')
  if (themeColor) themeColor.setAttribute('content', dark ? '#0b1115' : '#086f68')
})()
