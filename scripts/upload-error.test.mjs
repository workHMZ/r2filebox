import assert from 'node:assert/strict'
import test from 'node:test'
import { isTerminalUploadError } from '../frontend/src/utils/upload-error.ts'

test('terminal upload failures discard resumable state', () => {
  for (const status of [400, 401, 404, 410, 413]) {
    assert.equal(isTerminalUploadError({ status }), true)
    assert.equal(isTerminalUploadError({ response: { status } }), true)
  }
})

test('retryable and unknown upload failures preserve resumable state', () => {
  for (const status of [429, 500, 502, 503]) {
    assert.equal(isTerminalUploadError({ status }), false)
    assert.equal(isTerminalUploadError({ response: { status } }), false)
  }
  assert.equal(isTerminalUploadError(new TypeError('network unavailable')), false)
  assert.equal(isTerminalUploadError(null), false)
})
