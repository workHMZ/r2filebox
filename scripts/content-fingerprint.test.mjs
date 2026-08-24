import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CONTENT_FINGERPRINT_ALGORITHM as frontendAlgorithm,
  CONTENT_FINGERPRINT_PART_SIZE as frontendPartSize,
  deriveContentFingerprint as deriveFrontendFingerprint,
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
