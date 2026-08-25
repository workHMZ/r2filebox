import assert from 'node:assert/strict'
import test from 'node:test'

import { parseShareCode } from '../frontend/src/utils/share-code.ts'

const code = 'fjtdFGZ6KLN4'

test('keeps a raw share code', () => {
  assert.equal(parseShareCode(`  ${code}  `), code)
})

test('extracts codes from supported share links', () => {
  const links = [
    `https://box.example/#/share/${code}`,
    `https://box.example/#/share/${code}?source=copy`,
    `https://box.example/share/${code}`,
    `https://box.example/share/${code}/`,
    `#/share/${code}`,
    `/share/${code}`,
  ]

  for (const link of links) assert.equal(parseShareCode(link), code, link)
})

test('rejects codes outside the alphabet the Worker accepts', () => {
  // 0, 1, I, O, and l are excluded from the generated alphabet, and the API
  // rejects them outright, so they must never reach the share route.
  for (const ambiguous of ['0', '1', 'I', 'O', 'l']) {
    const input = `${code.slice(0, -1)}${ambiguous}`
    assert.equal(parseShareCode(input), '', input)
    assert.equal(parseShareCode(`https://box.example/#/share/${input}`), '', input)
  }
  assert.equal(parseShareCode('abc_def-ghi'), '')
})

test('rejects unrelated or malformed links', () => {
  const invalid = [
    '',
    'https://box.example/admin',
    'https://box.example/#/share/',
    `https://box.example/#/share/${code}/extra`,
    'javascript:alert(1)',
    'contains spaces',
    'x'.repeat(129),
  ]

  for (const input of invalid) assert.equal(parseShareCode(input), '', input)
})
