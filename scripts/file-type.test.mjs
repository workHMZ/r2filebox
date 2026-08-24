import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyFile,
  FILE_TYPE_BY_EXTENSION,
  getFileExtension,
  inferMimeType,
} from '../frontend/src/utils/file-type.ts'
import { MIME_BY_EXTENSION } from '../worker/src/lib/validators.ts'

test('keeps frontend and Worker extension MIME maps in parity', () => {
  const frontendMimeByExtension = Object.fromEntries(
    Object.entries(FILE_TYPE_BY_EXTENSION).map(([extension, definition]) => [
      extension,
      definition.mimeType,
    ]),
  )

  assert.deepEqual(frontendMimeByExtension, MIME_BY_EXTENSION)
})

test('extracts a normalized extension from a filename', () => {
  assert.equal(getFileExtension('IMG_8400.MOV'), 'mov')
  assert.equal(getFileExtension('folder\\photo.HEIC'), 'heic')
  assert.equal(getFileExtension('.mov'), 'mov')
  assert.equal(getFileExtension('.env'), 'env')
  assert.equal(getFileExtension('filename.'), '')
})

test('classifies known MIME types before considering the extension', () => {
  assert.equal(classifyFile('misleading.jpg', 'video/quicktime'), 'video')
  assert.equal(classifyFile('unknown.bin', 'IMAGE/HEIC; charset=binary'), 'image')
  assert.equal(classifyFile('unknown.bin', 'text/plain; charset=utf-8'), 'document')
  assert.equal(classifyFile('unknown.bin', 'application/x-rar-compressed'), 'archive')
})

test('falls back to broad extension categories for generic or missing MIME types', () => {
  const cases = [
    ['IMG_8400.mov', 'video'],
    ['clip.webm', 'video'],
    ['IMG_1234.HEIC', 'image'],
    ['photo.heif', 'image'],
    ['photo.webp', 'image'],
    ['photo.avif', 'image'],
    ['recording.m4a', 'audio'],
    ['recording.wav', 'audio'],
    ['report.docx', 'document'],
    ['sheet.xlsx', 'document'],
    ['slides.pptx', 'document'],
    ['backup.rar', 'archive'],
    ['backup.7z', 'archive'],
  ]

  for (const [filename, category] of cases) {
    assert.equal(classifyFile(filename, 'application/octet-stream'), category, filename)
  }

  assert.equal(classifyFile('unknown.custom'), 'other')
})

test('infers a standard MIME type only when the provided MIME is generic or missing', () => {
  assert.equal(inferMimeType('IMG_8400.mov', ''), 'video/quicktime')
  assert.equal(inferMimeType('IMG_1234.HEIC', 'application/octet-stream'), 'image/heic')
  assert.equal(inferMimeType('photo.heif'), 'image/heif')
  assert.equal(inferMimeType('photo.webp'), 'image/webp')
  assert.equal(inferMimeType('photo.avif'), 'image/avif')
  assert.equal(inferMimeType('recording.m4a'), 'audio/mp4')
  assert.equal(inferMimeType('clip.webm'), 'video/webm')
  assert.equal(inferMimeType('recording.wav'), 'audio/wav')
  assert.equal(inferMimeType('report.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  assert.equal(inferMimeType('archive.rar'), 'application/vnd.rar')
  assert.equal(inferMimeType('unknown.bin', ' Application/X-Custom; version=1 '), 'application/x-custom')
  assert.equal(inferMimeType('clip.webm', 'binary/octet-stream'), 'video/webm')
  assert.equal(inferMimeType('clip.webm', 'not-a-mime'), 'video/webm')
  assert.equal(inferMimeType('unknown.bin'), 'application/octet-stream')
})
