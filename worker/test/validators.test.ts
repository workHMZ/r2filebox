import { describe, expect, it } from 'vitest'
import { contentDispositionAttachment } from '../src/lib/validators'

describe('Content-Disposition RFC 5987 / 8187 compliance', () => {
  it('encodes RFC 8187 special characters', () => {
    expect(contentDispositionAttachment("user's_file.txt")).toContain("filename*=UTF-8''user%27s_file.txt")
    expect(contentDispositionAttachment("test(1).txt")).toContain("filename*=UTF-8''test%281%29.txt")
    expect(contentDispositionAttachment("foo*bar.txt")).toContain("filename*=UTF-8''foo%2Abar.txt")
    expect(contentDispositionAttachment("中文 文件.txt")).toContain("filename*=UTF-8''%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6.txt")
  })
})
