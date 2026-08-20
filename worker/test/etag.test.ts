import { describe, expect, it } from 'vitest'
import { ifNoneMatchMatches, isSafeInlinePreviewMime } from '../src/routes/share'

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
