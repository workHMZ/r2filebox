import assert from 'node:assert/strict'
import test from 'node:test'
import { sendUploadPart } from '../frontend/src/utils/upload-transport.ts'

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const instances = []
  class FakeXHR {
    upload = {}
    headers = {}
    status = 200
    responseText = '{"code":200}'
    aborted = false
    open() {}
    setRequestHeader(key, value) { this.headers[key] = value }
    getResponseHeader() { return '3' }
    send() { instances.push(this) }
    abort() { this.aborted = true; this.onabort?.() }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest')
  globalThis.XMLHttpRequest = FakeXHR
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'XMLHttpRequest', original)
    else delete globalThis.XMLHttpRequest
  })
  const start = (signal, progress) => sendUploadPart('token', 2, new Blob(['part']), signal, progress)
  return { instances, start }
}

test('a stalled part aborts and rejects as a retryable network failure', async t => {
  const { instances, start } = setup(t)
  const promise = start()
  const rejection = assert.rejects(promise, TypeError)
  t.mock.timers.tick(120_000)
  await rejection
  assert.equal(instances[0].aborted, true)
  assert.equal(instances[0].timeout, 30 * 60_000)
})

test('progress extends the idle deadline but repeated byte counts do not', async t => {
  const { instances, start } = setup(t)
  const progress = []
  const promise = start(undefined, bytes => progress.push(bytes))
  const rejection = assert.rejects(promise, TypeError)
  t.mock.timers.tick(110_000)
  instances[0].upload.onprogress({ loaded: 1 })
  t.mock.timers.tick(110_000)
  assert.equal(instances[0].aborted, false)
  instances[0].upload.onprogress({ loaded: 1 })
  t.mock.timers.tick(10_000)
  await rejection
  assert.deepEqual(progress, [1, 1])
})

test('successful requests return response metadata and clear the idle timer', async t => {
  const { instances, start } = setup(t)
  const promise = start()
  instances[0].onload()
  assert.deepEqual(await promise, { status: 200, responseText: '{"code":200}', retryAfter: '3' })
  t.mock.timers.tick(120_000)
  assert.equal(instances[0].aborted, false)
})

test('user cancellation stays AbortError and clears timers', async t => {
  const { instances, start } = setup(t)
  const controller = new AbortController()
  const promise = start(controller.signal)
  controller.abort()
  await assert.rejects(promise, { name: 'AbortError' })
  t.mock.timers.tick(120_000)
  assert.equal(instances[0].aborted, true)
  await assert.rejects(start(controller.signal), { name: 'AbortError' })
  assert.equal(instances.length, 1)
})

for (const event of ['onerror', 'ontimeout']) {
  test(`${event} remains retryable and releases the timer`, async t => {
    const { instances, start } = setup(t)
    const promise = start()
    instances[0][event]()
    await assert.rejects(promise, TypeError)
    t.mock.timers.tick(120_000)
    assert.equal(instances[0].aborted, false)
  })
}

test('a synchronous send failure settles and releases the timer', async t => {
  const { start } = setup(t)
  t.mock.method(XMLHttpRequest.prototype, 'send', () => { throw new Error('send failed') })
  await assert.rejects(start(), /send failed/)
  t.mock.timers.tick(120_000)
})
