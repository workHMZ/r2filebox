export type FileCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'archive'
  | 'other'

type FileTypeDefinition = {
  mimeType: string
  category: Exclude<FileCategory, 'other'>
}

export const FILE_TYPE_BY_EXTENSION: Readonly<Record<string, FileTypeDefinition>> = {
  jpg: { mimeType: 'image/jpeg', category: 'image' },
  jpeg: { mimeType: 'image/jpeg', category: 'image' },
  png: { mimeType: 'image/png', category: 'image' },
  gif: { mimeType: 'image/gif', category: 'image' },
  bmp: { mimeType: 'image/bmp', category: 'image' },
  tif: { mimeType: 'image/tiff', category: 'image' },
  tiff: { mimeType: 'image/tiff', category: 'image' },
  webp: { mimeType: 'image/webp', category: 'image' },
  avif: { mimeType: 'image/avif', category: 'image' },
  heic: { mimeType: 'image/heic', category: 'image' },
  heif: { mimeType: 'image/heif', category: 'image' },
  svg: { mimeType: 'image/svg+xml', category: 'image' },

  mp4: { mimeType: 'video/mp4', category: 'video' },
  mov: { mimeType: 'video/quicktime', category: 'video' },
  webm: { mimeType: 'video/webm', category: 'video' },
  avi: { mimeType: 'video/x-msvideo', category: 'video' },
  mkv: { mimeType: 'video/x-matroska', category: 'video' },
  mpeg: { mimeType: 'video/mpeg', category: 'video' },
  mpg: { mimeType: 'video/mpeg', category: 'video' },

  mp3: { mimeType: 'audio/mpeg', category: 'audio' },
  m4a: { mimeType: 'audio/mp4', category: 'audio' },
  wav: { mimeType: 'audio/wav', category: 'audio' },
  aac: { mimeType: 'audio/aac', category: 'audio' },
  flac: { mimeType: 'audio/flac', category: 'audio' },
  ogg: { mimeType: 'audio/ogg', category: 'audio' },

  pdf: { mimeType: 'application/pdf', category: 'document' },
  txt: { mimeType: 'text/plain', category: 'document' },
  md: { mimeType: 'text/markdown', category: 'document' },
  csv: { mimeType: 'text/csv', category: 'document' },
  json: { mimeType: 'application/json', category: 'document' },
  xml: { mimeType: 'application/xml', category: 'document' },
  rtf: { mimeType: 'application/rtf', category: 'document' },
  doc: { mimeType: 'application/msword', category: 'document' },
  docx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    category: 'document',
  },
  xls: { mimeType: 'application/vnd.ms-excel', category: 'document' },
  xlsx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    category: 'document',
  },
  ppt: { mimeType: 'application/vnd.ms-powerpoint', category: 'document' },
  pptx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    category: 'document',
  },
  odt: { mimeType: 'application/vnd.oasis.opendocument.text', category: 'document' },
  ods: { mimeType: 'application/vnd.oasis.opendocument.spreadsheet', category: 'document' },
  odp: { mimeType: 'application/vnd.oasis.opendocument.presentation', category: 'document' },

  zip: { mimeType: 'application/zip', category: 'archive' },
  rar: { mimeType: 'application/vnd.rar', category: 'archive' },
  '7z': { mimeType: 'application/x-7z-compressed', category: 'archive' },
  tar: { mimeType: 'application/x-tar', category: 'archive' },
  gz: { mimeType: 'application/gzip', category: 'archive' },
  bz2: { mimeType: 'application/x-bzip2', category: 'archive' },
  xz: { mimeType: 'application/x-xz', category: 'archive' },
}

const CATEGORY_BY_MIME = new Map<string, Exclude<FileCategory, 'other'>>()
for (const definition of Object.values(FILE_TYPE_BY_EXTENSION)) {
  CATEGORY_BY_MIME.set(definition.mimeType, definition.category)
}

const MIME_CATEGORY_ALIASES: Record<string, Exclude<FileCategory, 'other'>> = {
  'application/x-zip-compressed': 'archive',
  'application/x-rar-compressed': 'archive',
  'application/x-gzip': 'archive',
}

const FALLBACK_MIME_TYPE = 'application/octet-stream'
const GENERIC_MIME_TYPES = new Set([
  FALLBACK_MIME_TYPE,
  'application/binary',
  'application/x-binary',
  'binary/octet-stream',
])
const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/

const normalizeMimeType = (mimeType?: string | null): string => {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase() || ''
  return MIME_TYPE_PATTERN.test(normalized) ? normalized : ''
}

export const getFileExtension = (filename: string): string => {
  const basename = filename.replaceAll('\\', '/').split('/').pop() || ''
  const dotIndex = basename.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === basename.length - 1) return ''
  return basename.slice(dotIndex + 1).toLowerCase()
}

export const classifyFile = (
  filename: string,
  mimeType?: string | null,
): FileCategory => {
  const normalizedMimeType = normalizeMimeType(mimeType)

  if (normalizedMimeType && !GENERIC_MIME_TYPES.has(normalizedMimeType)) {
    if (normalizedMimeType.startsWith('image/')) return 'image'
    if (normalizedMimeType.startsWith('video/')) return 'video'
    if (normalizedMimeType.startsWith('audio/')) return 'audio'
    if (normalizedMimeType.startsWith('text/')) return 'document'

    const mimeCategory = CATEGORY_BY_MIME.get(normalizedMimeType)
      || MIME_CATEGORY_ALIASES[normalizedMimeType]
    if (mimeCategory) return mimeCategory
  }

  return FILE_TYPE_BY_EXTENSION[getFileExtension(filename)]?.category || 'other'
}

export const inferMimeType = (
  filename: string,
  providedMimeType?: string | null,
): string => {
  const normalizedMimeType = normalizeMimeType(providedMimeType)
  if (normalizedMimeType && !GENERIC_MIME_TYPES.has(normalizedMimeType)) {
    return normalizedMimeType
  }

  return FILE_TYPE_BY_EXTENSION[getFileExtension(filename)]?.mimeType || FALLBACK_MIME_TYPE
}
