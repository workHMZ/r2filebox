import { describe, expect, it } from 'vitest'
import { ifNoneMatchMatches, isSafeInlinePreviewMime, parseByteRange } from '../src/routes/share'

describe('If-None-Match handling', () => {
  it('matches quoted, weak, and comma-separated entity tags', () => {
    expect(ifNoneMatchMatches('"abc123"', '"abc123"')).toBe(true)
    expect(ifNoneMatchMatches('W/"abc123"', '"abc123"')).toBe(true)
    expect(ifNoneMatchMatches('"other", W/"abc123"', '"abc123"')).toBe(true)
    expect(ifNoneMatchMatches('*', '"abc123"')).toBe(true)
  })

  it('does not match a different entity tag', () => {
    expect(ifNoneMatchMatches('"abc1234"', '"abc123"')).toBe(false)
  })
})

describe('Range header resolution', () => {
  const size = 16

  it('resolves the satisfiable forms against the object size', () => {
    expect(parseByteRange('bytes=0-3', size)).toEqual({ kind: 'range', offset: 0, length: 4 })
    expect(parseByteRange('bytes=8-', size)).toEqual({ kind: 'range', offset: 8, length: 8 })
    expect(parseByteRange('bytes=-4', size)).toEqual({ kind: 'range', offset: 12, length: 4 })
    // An end or suffix past the object is clamped rather than rejected.
    expect(parseByteRange('bytes=0-999', size)).toEqual({ kind: 'range', offset: 0, length: 16 })
    expect(parseByteRange('bytes=-999', size)).toEqual({ kind: 'range', offset: 0, length: 16 })
  })

  it('reports a first byte at or past the end as unsatisfiable', () => {
    expect(parseByteRange('bytes=16-20', size)).toEqual({ kind: 'unsatisfiable' })
    expect(parseByteRange('bytes=100-', size)).toEqual({ kind: 'unsatisfiable' })
    expect(parseByteRange('bytes=-0', size)).toEqual({ kind: 'unsatisfiable' })
    expect(parseByteRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' })
  })

  it('ignores an absent or unusable header so the response stays a plain 200', () => {
    expect(parseByteRange(undefined, size)).toEqual({ kind: 'none' })
    expect(parseByteRange('bytes=abc', size)).toEqual({ kind: 'none' })
    expect(parseByteRange('bytes=-', size)).toEqual({ kind: 'none' })
    expect(parseByteRange('bytes=5-3', size)).toEqual({ kind: 'none' })
    // Multi-range and non-byte units are not served as a single part.
    expect(parseByteRange('bytes=0-1,4-5', size)).toEqual({ kind: 'none' })
    expect(parseByteRange('items=0-1', size)).toEqual({ kind: 'none' })
  })
})

describe('inline preview MIME policy', () => {
  it('allows passive media while rejecting active or arbitrary documents', () => {
    expect(isSafeInlinePreviewMime('video/mp4')).toBe(true)
    expect(isSafeInlinePreviewMime('audio/mpeg')).toBe(true)
    expect(isSafeInlinePreviewMime('image/png')).toBe(true)
    expect(isSafeInlinePreviewMime('image/svg+xml')).toBe(false)
    expect(isSafeInlinePreviewMime(' Image/SVG+XML; charset=utf-8 ')).toBe(false)
    expect(isSafeInlinePreviewMime('text/html')).toBe(false)
    expect(isSafeInlinePreviewMime('application/pdf')).toBe(false)
    expect(isSafeInlinePreviewMime(null)).toBe(false)
  })
})
