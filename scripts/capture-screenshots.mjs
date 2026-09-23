#!/usr/bin/env node

/*
 * Regenerates the README screenshots from a running instance.
 *
 * The shots in docs/screenshots went three releases stale because there was no
 * way to refresh them, so this drives a headless Chrome over the DevTools
 * Protocol instead. Node's global WebSocket and an installed Chrome are the
 * only requirements — no browser-automation dependency enters package.json,
 * and nothing here runs in `npm run verify`.
 *
 *   npm run dev            # wrangler on :8787, serving frontend/dist
 *   npm run build          # make sure dist is current first
 *   node scripts/capture-screenshots.mjs
 *
 * Admin credentials come from the environment or .dev.vars; they never leave
 * this process.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'docs/screenshots')
const origin = process.env.SCREENSHOT_ORIGIN || 'http://localhost:8787'
const locale = process.env.SCREENSHOT_LOCALE || 'zh'
const theme = process.env.SCREENSHOT_THEME || 'light'
const debugPort = Number(process.env.SCREENSHOT_CDP_PORT || 9333)

// Captured wide, published at 1600px: the extra density keeps 13px UI text
// legible after GitHub scales the image down.
const viewport = { width: 1280, height: 940, deviceScaleFactor: 2 }
const publishWidth = 1600

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

main().catch((error) => {
  console.error(`Screenshot capture failed: ${error.message}`)
  process.exitCode = 1
})

async function main() {
  const chrome = CHROME_CANDIDATES.find((path) => existsSync(path))
  if (!chrome) throw new Error('No Chrome/Chromium found. Set CHROME_PATH.')
  if (!(await reachable(origin))) {
    throw new Error(`${origin} is not responding. Start it with \`npm run dev\`.`)
  }
  mkdirSync(outDir, { recursive: true })

  const credentials = readAdminCredentials()
  const browser = launchChrome(chrome)

  try {
    const page = await openPage(await waitForDevTools())
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('DOM.enable')
    await page.send('Emulation.setDeviceMetricsOverride', { ...viewport, mobile: false })
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: theme }],
    })

    // Seed origin so localStorage is accessible
    await page.goto(`${origin}/`)

    const shots = []
    shots.push(...(await capturePublic(page)))
    shots.push(...(await captureAdmin(page, credentials)))

    for (const { name, data } of shots) await publish(name, data)
    console.log(`\nWrote ${shots.length} screenshots to docs/screenshots/.`)
  } finally {
    browser.kill()
  }
}

async function capturePublic(page) {
  const shots = []

  // 1. home-file-share.png: 中文 (zh) · 白天模式 (light)
  await page.setConfig({ locale: 'zh', theme: 'light' })
  await page.goto(`${origin}/#/`)
  await page.reload()
  await page.waitFor('.el-tabs__item')
  await page.clickTab(0)
  await page.attachFile('.upload-dragger input[type=file]', await sampleFile())
  await page.waitFor('.file-preview-card')
  await sleep(1200) // the content fingerprint has to finish before the CTA enables
  shots.push({ name: 'home-file-share.png', data: await page.shoot() })

  // (Also update home-get-share.png for backwards compatibility)
  await page.clickTab(2)
  await page.waitFor('.code-input input')
  await page.setFieldValue('.code-input input', 'R2BOX9K4TQ')
  await sleep(400)
  shots.push({ name: 'home-get-share.png', data: await page.shoot() })

  // 2. share-created.png: 日本語 (ja) · 白天模式 (light)
  await page.setConfig({ locale: 'ja', theme: 'light' })
  await page.goto(`${origin}/#/`)
  await page.reload()
  await page.waitFor('.el-tabs__item')
  await page.clickTab(0)
  await page.attachFile('.upload-dragger input[type=file]', await sampleFile())
  await page.waitFor('.file-preview-card')
  await sleep(1200)
  await page.waitFor('.upload-btn:not(.is-disabled)')
  await page.eval(`document.querySelector('.upload-btn').click()`)
  await page.waitFor('.stub-code-value')
  // The success toast floats over the dialog; drop it rather than wait it out.
  await page.eval(`document.querySelectorAll('.el-message').forEach((el) => el.remove())`)
  await sleep(600)
  shots.push({ name: 'share-created.png', data: await page.shoot() })

  const code = await page.eval(`document.querySelector('.stub-code-value').textContent.trim()`)

  // 3. pickup-file.png: English (en) · 黑暗模式 (dark)
  await page.setConfig({ locale: 'en', theme: 'dark' })
  await page.goto(`${origin}/#/share/${code}`)
  await page.reload()
  await page.waitFor('.content-section')
  await sleep(800)
  shots.push({ name: 'pickup-file.png', data: await page.shoot() })

  return shots
}

async function captureAdmin(page, { username, password }) {
  // Ensure we are logged into admin
  await page.setConfig({ locale: 'en', theme: 'light' })
  await page.goto(`${origin}/#/admin/login`)
  await page.reload()
  const login = await page.eval(`
    fetch('/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: ${JSON.stringify(JSON.stringify({ username, password }))},
    }).then((r) => r.status)
  `, true)
  if (login !== 200) throw new Error(`Admin login returned ${login}`)

  const shots = []

  // 4. admin-dashboard.png: English (en) · 白天模式 (light)
  await page.setConfig({ locale: 'en', theme: 'light' })
  await page.goto(`${origin}/#/admin/dashboard`)
  await page.reload()
  await page.waitFor('.stat-card')
  await sleep(1500) // let the charts finish their entry animation
  shots.push({ name: 'admin-dashboard.png', data: await page.shoot() })

  // 5. admin-files.png: 中文 (zh) · 黑暗模式 (dark)
  await page.setConfig({ locale: 'zh', theme: 'dark' })
  await page.goto(`${origin}/#/admin/files`)
  await page.reload()
  await page.waitFor('.files-card')
  await sleep(800)
  shots.push({ name: 'admin-files.png', data: await page.shoot() })

  // 6. admin-maintenance.png: 日本語 (ja) · 黑暗模式 (dark)
  await page.setConfig({ locale: 'ja', theme: 'dark' })
  await page.goto(`${origin}/#/admin/maintenance`)
  await page.reload()
  await page.waitFor('.status-card')
  await sleep(800)
  shots.push({ name: 'admin-maintenance.png', data: await page.shoot() })

  return shots
}

async function publish(name, base64) {
  const target = resolve(outDir, name)
  await sharp(Buffer.from(base64, 'base64'))
    .resize({ width: publishWidth, withoutEnlargement: true })
    .png({ compressionLevel: 9, effort: 10, palette: true, quality: 90 })
    .toFile(target)
  const bytes = readFileSync(target).length
  console.log(`  ${name.padEnd(26)} ${(bytes / 1024).toFixed(0)} KB`)
}

/*
 * The demo upload. A generated image rather than a fixture checked into the
 * repo: it keeps the pickup shot showing the media preview without carrying a
 * binary that nothing else uses.
 */
async function sampleFile() {
  const dir = resolve(root, 'node_modules/.cache')
  mkdirSync(dir, { recursive: true })
  const target = resolve(dir, 'sprint-42-retro.png')
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">
    <rect width="1280" height="800" fill="#faf9f5"/>
    <rect x="0" y="0" width="8" height="800" fill="#cc785c"/>
    <text x="96" y="180" fill="#141413" font-family="Georgia, serif" font-size="64">Sprint 42 — Retro</text>
    <text x="96" y="252" fill="#6c6a64" font-family="Helvetica, sans-serif" font-size="28">Keep · Problem · Try</text>
    <g fill="#e6dfd8">
      <rect x="96" y="330" width="1088" height="2"/>
      <rect x="96" y="430" width="820" height="2"/>
      <rect x="96" y="530" width="960" height="2"/>
      <rect x="96" y="630" width="700" height="2"/>
    </g>
    <circle cx="1096" cy="640" r="88" fill="#cc785c" opacity="0.18"/>
  </svg>`)
  await sharp(svg).png().toFile(target)
  return target
}

function readAdminCredentials() {
  let username = process.env.ADMIN_USERNAME
  let password = process.env.ADMIN_PASSWORD
  const devVars = resolve(root, '.dev.vars')
  if ((!username || !password) && existsSync(devVars)) {
    for (const line of readFileSync(devVars, 'utf8').split('\n')) {
      const match = /^\s*(ADMIN_USERNAME|ADMIN_PASSWORD)\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (match[1] === 'ADMIN_USERNAME') username ||= value
      else password ||= value
    }
  }
  if (!password) throw new Error('Set ADMIN_PASSWORD, or provide it in .dev.vars.')
  return { username: username || 'admin', password }
}

function launchChrome(binary) {
  const child = spawn(binary, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    // Never touch the user's real profile.
    `--user-data-dir=${resolve(root, 'node_modules/.cache/screenshot-profile')}`,
    `--lang=${locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US'}`,
    '--hide-scrollbars',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' })
  child.on('error', (error) => {
    console.error(`Chrome failed to start: ${error.message}`)
  })
  return child
}

async function reachable(url) {
  try {
    await fetch(url, { method: 'HEAD' })
    return true
  } catch {
    return false
  }
}

async function waitForDevTools() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      if (response.ok) return `http://127.0.0.1:${debugPort}`
    } catch {
      // Chrome is still booting.
    }
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint never came up')
}

async function openPage(endpoint) {
  const response = await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })
  const target = await response.json()
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((done, fail) => {
    socket.addEventListener('open', done, { once: true })
    socket.addEventListener('error', () => fail(new Error('CDP socket failed')), { once: true })
  })

  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.fail(new Error(message.error.message))
    else waiter.done(message.result)
  })

  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = ++nextId
      pending.set(id, { done, fail })
      socket.send(JSON.stringify({ id, method, params }))
    })

  const evaluate = async (expression, awaitPromise = false) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    })
    if (exceptionDetails) {
      const detail = exceptionDetails.exception?.description || exceptionDetails.text
      throw new Error(`Page script threw: ${detail}`)
    }
    return result.value
  }

  return {
    send,
    eval: evaluate,
    async goto(url) {
      await send('Page.navigate', { url })
      await sleep(900)
    },
    async reload() {
      await send('Page.reload')
      await sleep(1000)
    },
    async setConfig({ locale, theme }) {
      await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: theme }],
      })
      await evaluate(`(() => {
        localStorage.setItem('r2filebox-locale', ${JSON.stringify(locale)});
        localStorage.setItem('r2filebox-theme', ${JSON.stringify(theme)});
      })()`)
    },
    async waitFor(selector, timeoutMs = 15000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return
        await sleep(200)
      }
      throw new Error(`Timed out waiting for ${selector}`)
    },
    // el-upload hides a real <input type=file>; CDP can hand it a path.
    async attachFile(selector, filePath) {
      const { root } = await send('DOM.getDocument', { depth: -1 })
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector })
      if (!nodeId) throw new Error(`No file input matched ${selector}`)
      await send('DOM.setFileInputFiles', { files: [filePath], nodeId })
      await sleep(600)
    },
    // Vue only reacts to a native setter call plus a dispatched input event.
    async setFieldValue(selector, value) {
      await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()`)
      await sleep(400)
    },
    async clickTab(index) {
      await evaluate(`document.querySelectorAll('.el-tabs__item')[${index}].click()`)
      await sleep(700)
    },
    async shoot() {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      return data
    },
  }
}

