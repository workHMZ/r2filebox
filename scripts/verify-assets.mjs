#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(root, 'frontend/public')
const manifest = JSON.parse(readFileSync(resolve(publicDir, 'manifest.webmanifest'), 'utf8'))
const failures = []
const expectedIcons = new Map([
  ['/app-icon-192.png', { width: 192, height: 192, purpose: 'any', maxBytes: 100_000 }],
  ['/app-icon-512.png', { width: 512, height: 512, purpose: 'any', maxBytes: 400_000 }],
  ['/app-icon-maskable-512.png', { width: 512, height: 512, purpose: 'maskable', maxBytes: 400_000 }],
])

checkPng('/favicon-32.png', 32, 32, 20_000)

for (const icon of manifest.icons || []) {
  const expected = expectedIcons.get(icon.src)
  if (!expected) {
    failures.push(`Unexpected manifest icon: ${icon.src || 'missing src'}`)
    continue
  }
  checkPng(icon.src, expected.width, expected.height, expected.maxBytes)
  if (icon.sizes !== `${expected.width}x${expected.height}`) {
    failures.push(`${icon.src} declares the wrong size: ${icon.sizes || 'missing'}`)
  }
  if (icon.type !== 'image/png') failures.push(`${icon.src} must declare image/png`)
  if (icon.purpose !== expected.purpose) failures.push(`${icon.src} must use purpose=${expected.purpose}`)
  expectedIcons.delete(icon.src)
}

for (const src of expectedIcons.keys()) failures.push(`Manifest icon is missing: ${src}`)

if (manifest.share_target?.action !== '/#/share-target' || manifest.share_target?.method !== 'GET') {
  failures.push('The Web Share Target must use GET /#/share-target')
}
if (manifest.share_target?.params?.files) failures.push('The manifest must not claim unsupported file share targets')
if (manifest.background_color !== '#f3f6f8') failures.push('The PWA splash background must stay light')
if (existsSync(resolve(publicDir, 'icon.png'))) failures.push('The 1024px source icon must not be served as a public UI asset')

if (failures.length) {
  console.error('Asset verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exitCode = 1
} else {
  console.log('PWA icon and manifest verification passed.')
}

function checkPng(src, expectedWidth, expectedHeight, maxBytes) {
  const path = resolve(publicDir, src.slice(1))
  if (!existsSync(path)) {
    failures.push(`Missing PNG asset: ${src}`)
    return
  }
  const buffer = readFileSync(path)
  const isPng = buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  if (!isPng) {
    failures.push(`${src} is not a valid PNG`)
    return
  }
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (width !== expectedWidth || height !== expectedHeight) {
    failures.push(`${src} is ${width}x${height}; expected ${expectedWidth}x${expectedHeight}`)
  }
  if (statSync(path).size > maxBytes) failures.push(`${src} exceeds its ${maxBytes}-byte size budget`)
}
