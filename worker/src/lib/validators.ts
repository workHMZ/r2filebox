const DEFAULT_MIME_TYPE = 'application/octet-stream'

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',

  // Video
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',

  // Audio
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',

  // Documents and archives already recognized by the client.
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
}

export const sanitizeFilename = (filename: string): string => {
  let safe = filename.replace(/^.*[\\\/]/, '')
  safe = safe
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
    .trim()
  if (!safe || safe === '.' || safe === '..') return 'unnamed_file'
  return [...safe].slice(0, 200).join('')
}

export const sanitizeMimeType = (mimeType: string): string => {
  const value = mimeType.trim().slice(0, 128)
  return /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/.test(value)
    ? value
    : DEFAULT_MIME_TYPE
}

export const resolveMimeType = (
  filename: string,
  providedMimeType?: string | null,
): string => {
  const provided = sanitizeMimeType(providedMimeType || '').toLowerCase()
  if (!isGenericMimeType(provided)) return provided

  const basename = filename.replace(/^.*[\\\/]/, '')
  const dotIndex = basename.lastIndexOf('.')
  const extension = dotIndex >= 0 && dotIndex < basename.length - 1
    ? basename.slice(dotIndex + 1).toLowerCase()
    : ''

  return MIME_BY_EXTENSION[extension] || DEFAULT_MIME_TYPE
}

const isGenericMimeType = (mimeType: string): boolean => {
  return mimeType === DEFAULT_MIME_TYPE ||
    mimeType === 'application/binary' ||
    mimeType === 'application/x-binary' ||
    mimeType === 'binary/octet-stream'
}

export const calculateExpireAt = (
  expireValue?: number,
  expireStyle?: string,
  defaultHours: number = 24,
  maxHours: number = 168
): string => {
  let hoursToAdd = defaultHours

  if (expireValue !== undefined && expireStyle !== undefined) {
    switch (expireStyle) {
      case 'minute':
        hoursToAdd = expireValue / 60
        break
      case 'hour':
        hoursToAdd = expireValue
        break
      case 'day':
        hoursToAdd = expireValue * 24
        break
      case 'week':
        hoursToAdd = expireValue * 24 * 7
        break
      default:
        hoursToAdd = defaultHours
    }
  }

  if (!Number.isFinite(hoursToAdd) || hoursToAdd <= 0) hoursToAdd = defaultHours
  hoursToAdd = Math.min(hoursToAdd, Math.max(maxHours, 1))

  const expireDate = new Date()
  // hoursToAdd can be fractional (e.g., for minutes).
  expireDate.setTime(expireDate.getTime() + hoursToAdd * 60 * 60 * 1000)
  
  return expireDate.toISOString()
}

export const contentDispositionAttachment = (filename: string): string => {
  return contentDisposition('attachment', filename)
}

export const contentDispositionInline = (filename: string): string => {
  return contentDisposition('inline', filename)
}

const contentDisposition = (disposition: 'attachment' | 'inline', filename: string): string => {
  const safe = sanitizeFilename(filename).replace(/"/g, '')
  // ASCII-only fallback for clients that don't support the RFC 5987 filename* parameter.
  const asciiFallback = safe.replace(/[^\x20-\x7E]/g, '_') || 'download'
  const encodedFilename = encodeURIComponent(safe)
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`
}
