#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(root, 'frontend/src/i18n/index.ts')
const source = readFileSync(sourcePath, 'utf8')
const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const failures = []
const expectedLocales = ['zh', 'en', 'ja']

let messagesNode
visit(sourceFile)
if (!messagesNode || !ts.isObjectLiteralExpression(messagesNode)) {
  failures.push('Could not find the i18n messages object')
}

const messages = new Map()
if (messagesNode && ts.isObjectLiteralExpression(messagesNode)) {
  for (const localeProperty of messagesNode.properties) {
    if (!ts.isPropertyAssignment(localeProperty) || !ts.isObjectLiteralExpression(localeProperty.initializer)) continue
    const locale = propertyName(localeProperty.name)
    const localeMessages = new Map()
    for (const messageProperty of localeProperty.initializer.properties) {
      if (!ts.isPropertyAssignment(messageProperty)) continue
      const key = propertyName(messageProperty.name)
      if (localeMessages.has(key)) failures.push(`${locale} contains duplicate key: ${key}`)
      if (!ts.isStringLiteralLike(messageProperty.initializer)) {
        failures.push(`${locale}.${key} must be a string literal`)
        continue
      }
      localeMessages.set(key, messageProperty.initializer.text)
    }
    messages.set(locale, localeMessages)
  }
}

for (const locale of expectedLocales) {
  if (!messages.has(locale)) failures.push(`Missing locale: ${locale}`)
}
for (const locale of messages.keys()) {
  if (!expectedLocales.includes(locale)) failures.push(`Unexpected locale: ${locale}`)
}

const reference = messages.get('zh') || new Map()
for (const locale of expectedLocales) {
  const localeMessages = messages.get(locale) || new Map()
  for (const key of reference.keys()) {
    if (!localeMessages.has(key)) failures.push(`${locale} is missing key: ${key}`)
  }
  for (const key of localeMessages.keys()) {
    if (!reference.has(key)) failures.push(`${locale} has extra key: ${key}`)
  }
}

for (const key of reference.keys()) {
  const expectedPlaceholders = placeholders(reference.get(key))
  for (const locale of expectedLocales.slice(1)) {
    const actualPlaceholders = placeholders(messages.get(locale)?.get(key))
    if (actualPlaceholders.join('|') !== expectedPlaceholders.join('|')) {
      failures.push(`${locale}.${key} placeholders (${actualPlaceholders.join(', ')}) do not match zh (${expectedPlaceholders.join(', ')})`)
    }
  }
}

const usedKeys = new Set()
for (const file of sourceFiles(resolve(root, 'frontend/src'))) {
  const content = readFileSync(file, 'utf8')
  for (const match of content.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) usedKeys.add(match[1])
}
for (const key of usedKeys) {
  if (!reference.has(key)) failures.push(`Code uses missing translation key: ${key}`)
}

if (failures.length) {
  console.error('i18n verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exitCode = 1
} else {
  console.log(`i18n verification passed: ${expectedLocales.length} locales, ${reference.size} keys, ${usedKeys.size} statically used keys.`)
}

function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'messages') {
    messagesNode = node.initializer
  }
  ts.forEachChild(node, visit)
}

function propertyName(node) {
  return ts.isStringLiteralLike(node) ? node.text : node.getText(sourceFile)
}

function placeholders(value = '') {
  return [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort()
}

function sourceFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(path))
    else if (['.ts', '.vue'].includes(extname(entry.name))) files.push(path)
  }
  return files
}
