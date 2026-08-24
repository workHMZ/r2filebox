import { describe, expect, it } from 'vitest'
import { contentDispositionAttachment, resolveMimeType } from '../src/lib/validators'

describe('Content-Disposition RFC 5987 / 8187 compliance', () => {
  it('encodes RFC 8187 special characters', () => {
    expect(contentDispositionAttachment("user's_file.txt")).toContain("filename*=UTF-8''user%27s_file.txt")
    expect(contentDispositionAttachment("test(1).txt")).toContain("filename*=UTF-8''test%281%29.txt")
    expect(contentDispositionAttachment("foo*bar.txt")).toContain("filename*=UTF-8''foo%2Abar.txt")
    expect(contentDispositionAttachment("中文 文件.txt")).toContain("filename*=UTF-8''%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6.txt")
  })
})

describe('file MIME resolution', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.gif', 'image/gif'],
    ['photo.bmp', 'image/bmp'],
    ['photo.tif', 'image/tiff'],
    ['photo.tiff', 'image/tiff'],
    ['photo.webp', 'image/webp'],
    ['photo.avif', 'image/avif'],
    ['photo.heic', 'image/heic'],
    ['photo.heif', 'image/heif'],
    ['graphic.svg', 'image/svg+xml'],
    ['movie.mp4', 'video/mp4'],
    ['movie.mov', 'video/quicktime'],
    ['movie.webm', 'video/webm'],
    ['movie.avi', 'video/x-msvideo'],
    ['movie.mkv', 'video/x-matroska'],
    ['movie.mpeg', 'video/mpeg'],
    ['movie.mpg', 'video/mpeg'],
    ['sound.mp3', 'audio/mpeg'],
    ['sound.m4a', 'audio/mp4'],
    ['sound.wav', 'audio/wav'],
    ['sound.aac', 'audio/aac'],
    ['sound.flac', 'audio/flac'],
    ['sound.ogg', 'audio/ogg'],
    ['document.pdf', 'application/pdf'],
    ['notes.txt', 'text/plain'],
    ['notes.md', 'text/markdown'],
    ['table.csv', 'text/csv'],
    ['data.json', 'application/json'],
    ['data.xml', 'application/xml'],
    ['document.rtf', 'application/rtf'],
    ['document.doc', 'application/msword'],
    ['document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['sheet.xls', 'application/vnd.ms-excel'],
    ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['slides.ppt', 'application/vnd.ms-powerpoint'],
    ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['document.odt', 'application/vnd.oasis.opendocument.text'],
    ['sheet.ods', 'application/vnd.oasis.opendocument.spreadsheet'],
    ['slides.odp', 'application/vnd.oasis.opendocument.presentation'],
    ['archive.zip', 'application/zip'],
    ['archive.rar', 'application/vnd.rar'],
    ['archive.7z', 'application/x-7z-compressed'],
    ['archive.tar', 'application/x-tar'],
    ['archive.gz', 'application/gzip'],
    ['archive.bz2', 'application/x-bzip2'],
    ['archive.xz', 'application/x-xz'],
  ])('infers %s from its extension when MIME is missing', (filename, expected) => {
    expect(resolveMimeType(filename, '')).toBe(expected)
  })

  it.each([
    'application/octet-stream',
    'Application/Octet-Stream',
    'application/binary',
    'application/x-binary',
    'binary/octet-stream',
  ])('falls back to the extension for generic MIME %s', (genericMime) => {
    expect(resolveMimeType('C:\\fakepath\\IMG_8400.MOV', genericMime)).toBe('video/quicktime')
  })

  it('recognizes uppercase MOV and HEIC extensions with generic MIME', () => {
    expect(resolveMimeType('IMG_8400.MOV', 'application/octet-stream')).toBe('video/quicktime')
    expect(resolveMimeType('IMG_8401.HEIC', 'application/octet-stream')).toBe('image/heic')
  })

  it('prefers a valid non-generic MIME over the filename extension', () => {
    expect(resolveMimeType('misleading.mov', ' image/png ')).toBe('image/png')
    expect(resolveMimeType('misleading.heic', 'application/x-custom')).toBe('application/x-custom')
  })

  it('normalizes valid MIME parameters and casing before resolving', () => {
    expect(resolveMimeType('unknown.bin', ' Application/X-Custom; version=1 ')).toBe('application/x-custom')
    expect(resolveMimeType('unknown.bin', 'IMAGE/HEIC; charset=binary')).toBe('image/heic')
    expect(resolveMimeType('clip.WEBM', 'video/webm; charset=utf-8')).toBe('video/webm')
  })

  it('uses the extension after rejecting malformed MIME input', () => {
    expect(resolveMimeType('clip.WEBM', 'not-a-mime')).toBe('video/webm')
  })

  it('keeps the safe generic fallback for unknown or extensionless filenames', () => {
    expect(resolveMimeType('unknown.data', null)).toBe('application/octet-stream')
    expect(resolveMimeType('README', undefined)).toBe('application/octet-stream')
    expect(resolveMimeType('trailing.', '')).toBe('application/octet-stream')
  })
})
