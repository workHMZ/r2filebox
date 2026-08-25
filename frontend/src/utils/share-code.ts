// Mirror the Base58-style alphabet the Worker accepts (no 0, 1, I, O, or l),
// so an unusable code is caught in the input instead of after a 404 round trip.
const SHARE_CODE_PATTERN = /^[23456789A-HJ-NP-Za-km-z]{1,128}$/

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
