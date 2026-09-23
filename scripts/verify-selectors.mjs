#!/usr/bin/env node

// Ad blockers ship generic cosmetic filters for social share widgets. Those
// rules are injected as a *user-origin* stylesheet, so a `display: none
// !important` from a filter list outranks every author style the app can
// write — including an inline one. A route whose root element carries a name
// from that namespace renders as a blank page, and only for the users who run
// a blocker, which is why it survived every local check: `.share-page` blanked
// the whole share route in production.
//
// The two lists below are not guesses. They were measured by appending probe
// elements to a live page in a browser with the usual filter lists enabled and
// reading back the computed style (2026-09-22, EasyList + Fanboy Social).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = resolve(root, 'frontend/src')
const scannedExtensions = new Set(['.vue', '.scss', '.css', '.html'])

const blockedClasses = [
  'article-share', 'entry-share', 'post-share', 'share-block', 'share-bottom',
  'share-box', 'share-button', 'share-buttons', 'share-icon', 'share-list',
  'share-menu', 'share-page', 'share-panel', 'share-post', 'share-toolbar',
  'share-tools', 'share-top', 'share-wrap', 'sharedaddy', 'sharethis',
  'sharing-item', 'sharing-tools', 'social-bar', 'social-block', 'social-box',
  'social-count', 'social-menu', 'social-nav', 'social-share',
  'social-share-bar', 'social-share-block', 'social-share-buttons',
  'social-share-container', 'social-share-links', 'social-share-widget',
  'social-share-wrapper', 'social-tools', 'social-widget', 'socialshare',
]

const blockedIds = [
  'share-block', 'share-buttons', 'share-container', 'share-holder',
  'share-links', 'share-post', 'social-buttons', 'social-media',
  'social-widget', 'social-wrapper', 'socialshare',
]

const blocked = new Map()
for (const name of blockedClasses) blocked.set(name, ['class'])
for (const name of blockedIds) blocked.set(name, [...(blocked.get(name) || []), 'id'])

const failures = []

for (const file of collectSources(sourceDir)) {
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
  lines.forEach((line, index) => {
    for (const [name, kinds] of blocked) {
      if (!new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(line)) continue
      failures.push(
        `${relative(root, file)}:${index + 1} uses "${name}", which common ad-block filter lists hide as a social share widget (${kinds.join('/')} selector)`,
      )
    }
  })
}

if (failures.length) {
  console.error('Selector verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  console.error('Rename these out of the share/social namespace; a filter list beats every author style, including inline.')
  process.exitCode = 1
} else {
  console.log(`Selector verification passed: no ad-block-hidden names in ${relative(root, sourceDir)}.`)
}

function collectSources(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry)
    if (statSync(path).isDirectory()) found.push(...collectSources(path))
    else if (scannedExtensions.has(extname(entry))) found.push(path)
  }
  return found
}

// Blank comments out rather than dropping them so reported line numbers still
// point at the source, and so the note explaining this rule does not trip it.
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:\w])\/\/[^\n]*/g, (match, prefix) => prefix + blank(match.slice(prefix.length)))
}

function blank(match) {
  return match.replace(/[^\n]/g, ' ')
}
