import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CONTENT_FINGERPRINT_ALGORITHM as frontendAlgorithm,
  CONTENT_FINGERPRINT_PART_SIZE as frontendPartSize,
  deriveContentFingerprint as deriveFrontendFingerprint,
  fingerprintBlob,
} from '../frontend/src/utils/content-fingerprint.ts'
import {
  CONTENT_FINGERPRINT_ALGORITHM as workerAlgorithm,
  CONTENT_FINGERPRINT_PART_SIZE as workerPartSize,
  deriveContentFingerprint as deriveWorkerFingerprint,
  sha256Bytes,
} from '../worker/src/lib/content-fingerprint.ts'

test('frontend and Worker use the same content fingerprint protocol', async () => {
  assert.equal(frontendAlgorithm, workerAlgorithm)
  assert.equal(frontendPartSize, workerPartSize)

  const first = await sha256Bytes(new TextEncoder().encode('first part'))
  const second = await sha256Bytes(new TextEncoder().encode('second part'))
  const size = frontendPartSize + 11

  assert.equal(
    await deriveFrontendFingerprint(size, [first, second]),
    await deriveWorkerFingerprint(size, [first, second]),
  )
})

test('the tree fingerprint covers every part and the exact file size', async () => {
  const first = await sha256Bytes(new TextEncoder().encode('first part'))
  const second = await sha256Bytes(new TextEncoder().encode('second part'))
  const changed = await sha256Bytes(new TextEncoder().encode('changed second part'))
  const size = frontendPartSize + 11

  const baseline = await deriveWorkerFingerprint(size, [first, second])
  assert.notEqual(baseline, await deriveWorkerFingerprint(size, [first, changed]))
  assert.notEqual(baseline, await deriveWorkerFingerprint(size + 1, [first, second]))
})

test('rejects incomplete or malformed part manifests', async () => {
  const valid = await sha256Bytes(new TextEncoder().encode('part'))
  await assert.rejects(() => deriveWorkerFingerprint(frontendPartSize + 1, [valid]))
  await assert.rejects(() => deriveWorkerFingerprint(1, ['not-a-sha256']))
})

test('fingerprintBlob skips trailing macrotask timer for a single-part file', async (t) => {
  let timerCalls = 0
  const realSetTimeout = globalThis.setTimeout
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => {
    timerCalls++
    return realSetTimeout(fn, ms, ...args)
  })

  const singlePart = new Blob(['single part payload'])
  const result = await fingerprintBlob(singlePart)
  assert.equal(timerCalls, 0)
  assert.equal(result.partSha256.length, 1)
  assert.equal(
    result.fingerprint,
    await deriveWorkerFingerprint(singlePart.size, result.partSha256),
  )
})
