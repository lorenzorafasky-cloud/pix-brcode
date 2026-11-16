#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { runCli } from './cli/run.js'

const argv = process.argv.slice(2)
const [command, ...rest] = argv.filter((arg) => !arg.startsWith('-'))

// `pix-brcode parse` / `pix-brcode qr` without a code: read it from standard input.
if ((command === 'parse' || command === 'qr') && rest.length === 0 && !process.stdin.isTTY) {
  argv.push(readFileSync(0, 'utf8').trim())
}

process.exitCode = runCli(argv, {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
})
