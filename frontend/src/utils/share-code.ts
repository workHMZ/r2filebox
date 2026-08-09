const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const codeFromSharePath = (path: string): string => {
  const pathOnly = path.split(/[?#]/, 1)[0]
  const segments = pathOnly.split('/').filter(Boolean)
  if (segments.length < 2 || segments.at(-2) !== 'share') return ''

  try {
    const code = decodeURIComponent(segments.at(-1) || '')
    return SHARE_CODE_PATTERN.test(code) ? code : ''
  } catch {
    return ''
  }
}

/** Accept a raw code or extract it from a hash/direct share URL. */
export const parseShareCode = (input: string): string => {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (SHARE_CODE_PATTERN.test(trimmed)) return trimmed

  try {
    const url = new URL(trimmed, 'https://r2filebox.invalid/')
    return codeFromSharePath(url.hash.slice(1)) || codeFromSharePath(url.pathname)
  } catch {
    return ''
  }
}
