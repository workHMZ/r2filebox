import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(resolve(root, 'frontend/public/theme-init.js'), 'utf8')

function runThemeInit({ stored = null, systemDark = false, storageError = false } = {}) {
  const classes = new Set()
  const style = {}
  const meta = {
    content: '#086f68',
    setAttribute(name, value) {
      if (name === 'content') this.content = value
    },
  }
  const documentElement = {
    classList: {
      toggle(name, active) {
        if (active) classes.add(name)
        else classes.delete(name)
      },
    },
    style,
  }
  const localStorage = {
    getItem() {
      if (storageError) throw new Error('storage unavailable')
      return stored
    },
  }
  const window = {
    matchMedia() {
      return { matches: systemDark }
    },
  }
  const document = {
    documentElement,
    querySelector(selector) {
      return selector === 'meta[name="theme-color"]' ? meta : null
    },
  }

  vm.runInNewContext(source, { document, localStorage, window })
  return { classes, style, meta }
}

test('uses the operating-system theme when no manual preference exists', () => {
  const result = runThemeInit({ systemDark: true })
  assert.equal(result.classes.has('dark'), true)
  assert.equal(result.style.colorScheme, 'dark')
  assert.equal(result.meta.content, '#0b1115')
})

test('a saved manual preference overrides the operating-system theme', () => {
  const result = runThemeInit({ stored: 'light', systemDark: true })
  assert.equal(result.classes.has('dark'), false)
  assert.equal(result.style.colorScheme, 'light')
  assert.equal(result.meta.content, '#086f68')
})

test('falls back to the operating-system theme when storage is unavailable', () => {
  const result = runThemeInit({ systemDark: true, storageError: true })
  assert.equal(result.classes.has('dark'), true)
})

test('ignores malformed stored theme values', () => {
  const result = runThemeInit({ stored: 'sepia', systemDark: false })
  assert.equal(result.classes.has('dark'), false)
  assert.equal(result.style.colorScheme, 'light')
})
