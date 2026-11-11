#!/usr/bin/env node

import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { Writable } from 'node:stream'
import { hashPassword } from '../src/lib/password.ts'

const password = process.argv[2] || await readPassword()
if (password.length < 16 || password.length > 4096) {
  console.error('Password must contain 16-4096 characters.')
  process.exit(1)
}

console.log(await hashPassword(password))

async function readPassword() {
  if (!stdin.isTTY) {
    console.error('Run this command in an interactive terminal or pass the password as an argument.')
    return ''
  }

  const mutedOutput = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })
  const rl = createInterface({ input: stdin, output: mutedOutput, terminal: true })
  stdout.write('Admin password: ')
  try {
    return (await rl.question('')).trim()
  } finally {
    rl.close()
    stdout.write('\n')
  }
}
