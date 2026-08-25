import assert from 'node:assert/strict'
import test from 'node:test'

import { ADMIN_HOME, safeAdminRedirect } from '../frontend/src/utils/admin-redirect.ts'

test('keeps in-app admin destinations', () => {
  for (const value of ['/admin', '/admin/files', '/admin/logs?page=2', '/admin#top']) {
    assert.equal(safeAdminRedirect(value), value)
  }
})

test('falls back home for anything that is not an admin path', () => {
  const rejected = [
    undefined,
    null,
    42,
    ['/admin'],
    '',
    '/',
    '/share/ABCD2345EFGH',
    '/adminsomething',
    'admin/files',
  ]
  for (const value of rejected) {
    assert.equal(safeAdminRedirect(value), ADMIN_HOME, String(value))
  }
})

test('never follows a target that could leave the origin', () => {
  const offsite = [
    '//evil.example/admin',
    'https://evil.example/admin',
    'http://evil.example',
    'javascript:alert(1)',
    'data:text/html,<script></script>',
    // A scheme-relative host whose path mimics an in-app route.
    '//evil.example/admin/files',
  ]
  for (const value of offsite) {
    assert.equal(safeAdminRedirect(value), ADMIN_HOME, value)
  }
})
