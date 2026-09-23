#!/usr/bin/env node

import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/*
 * Every raster icon is rendered from frontend/public/favicon.svg, so the brand
 * mark only has to be maintained in one place. The previous pipeline rasterised
 * a separate 1024px PNG master, which is how the app icons kept the pre-redesign
 * artwork long after the SVG had moved to the warm editorial mark.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(root, 'frontend/public')
const markSource = resolve(publicDir, 'favicon.svg')

// The mark's own plate colour, so a maskable icon can bleed past the rounded
// corners the SVG draws without showing a seam.
const markPlate = { r: 24, g: 23, b: 21, alpha: 1 }
// Android masks crop to roughly the middle 80%; 336/512 keeps the vault inside
// the safe zone on every mask shape.
const maskableArtworkSize = 336
const maskableCanvasSize = 512

await mkdir(publicDir, { recursive: true })

await Promise.all([
  writeRegularIcon(192, 'app-icon-192.png'),
  writeRegularIcon(512, 'app-icon-512.png'),
  writeFavicon(),
  writeMaskableIcon(),
])

console.log('Generated the favicon and PWA icons from frontend/public/favicon.svg.')

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

function renderMark(size) {
  // Render above the target size, then downsample: rasterising the SVG at the
  // exact pixel size leaves the 1.2px hairlines of the R2 wordmark ragged.
  return sharp(markSource, { density: Math.ceil((size / 48) * 96) })
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
}

async function writeRegularIcon(size, filename) {
  await renderMark(size).png(pngOptions()).toFile(resolve(publicDir, filename))
}

async function writeFavicon() {
  await renderMark(32).png(pngOptions()).toFile(resolve(publicDir, 'favicon-32.png'))
}

async function writeMaskableIcon() {
  const padding = Math.floor((maskableCanvasSize - maskableArtworkSize) / 2)
  const artwork = await renderMark(maskableArtworkSize).png().toBuffer()

  await sharp({
    create: {
      width: maskableCanvasSize,
      height: maskableCanvasSize,
      channels: 4,
      background: markPlate,
    },
  })
    .composite([{ input: artwork, top: padding, left: padding }])
    .png(pngOptions())
    .toFile(resolve(publicDir, 'app-icon-maskable-512.png'))
}
