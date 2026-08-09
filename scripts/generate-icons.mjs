#!/usr/bin/env node

import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'frontend/assets/branding/icon-source-1024.png')
const publicDir = resolve(root, 'frontend/public')
const faviconSource = resolve(publicDir, 'favicon.svg')
const lightBackground = { r: 243, g: 246, b: 248, alpha: 1 }
const regularCrop = { left: 40, top: 40, width: 944, height: 944 }
const maskableArtworkSize = 336

await mkdir(publicDir, { recursive: true })

const metadata = await sharp(source).metadata()
if (metadata.width !== 1024 || metadata.height !== 1024) {
  throw new Error(`Icon source must be 1024x1024; received ${metadata.width ?? '?'}x${metadata.height ?? '?'}`)
}

await Promise.all([
  writeRegularIcon(192, 'app-icon-192.png'),
  writeRegularIcon(512, 'app-icon-512.png'),
  writeFavicon(),
  writeMaskableIcon(),
])

console.log('Generated the browser favicon from favicon.svg and PWA icons from the 1024px branding source.')

function pngOptions() {
  return {
    compressionLevel: 9,
    effort: 10,
    palette: true,
    quality: 92,
    colours: 256,
    dither: 0.8,
  }
}

async function writeRegularIcon(size, filename) {
  await sharp(source)
    .extract(regularCrop)
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png(pngOptions())
    .toFile(resolve(publicDir, filename))
}

async function writeFavicon() {
  await sharp(faviconSource, { density: 384 })
    .resize(32, 32, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png(pngOptions())
    .toFile(resolve(publicDir, 'favicon-32.png'))
}

async function writeMaskableIcon() {
  const padding = Math.floor((512 - maskableArtworkSize) / 2)

  await sharp(source)
    .extract(regularCrop)
    .resize(maskableArtworkSize, maskableArtworkSize, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: lightBackground,
    })
    .png(pngOptions())
    .toFile(resolve(publicDir, 'app-icon-maskable-512.png'))
}
