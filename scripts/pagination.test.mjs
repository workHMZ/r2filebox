import assert from 'node:assert/strict'
import test from 'node:test'

import { pageAfterRemoval } from '../frontend/src/utils/pagination.ts'

test('stays on the current page while it still holds rows', () => {
  // 45 rows over 20 per page: removing one leaves page 2 populated.
  assert.equal(pageAfterRemoval(2, 45, 20), 2)
  assert.equal(pageAfterRemoval(1, 1, 20), 1)
})

test('steps back when the last row of the final page is removed', () => {
  // 41 rows over 20 per page puts a single row on page 3.
  assert.equal(pageAfterRemoval(3, 41, 20), 2)
  assert.equal(pageAfterRemoval(2, 21, 20), 1)
})

test('never returns a page below one', () => {
  assert.equal(pageAfterRemoval(1, 0, 20), 1)
  assert.equal(pageAfterRemoval(0, 100, 20), 1)
  assert.equal(pageAfterRemoval(-5, 100, 20), 1)
})

test('tolerates unusable inputs instead of producing NaN', () => {
  assert.equal(pageAfterRemoval(Number.NaN, 100, 20), 1)
  assert.equal(pageAfterRemoval(2, 100, 0), 1)
  assert.equal(pageAfterRemoval(2, 100, Number.NaN), 1)
})
