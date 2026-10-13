import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

assert.equal(process.platform, 'win32', 'Run this check with Windows Node.js')
const require = createRequire(import.meta.url)
const executable = process.env.ELECTRON_BINARY || require('electron')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const result = spawnSync(
  executable,
  [fileURLToPath(new URL('windows-app-smoke.mjs', import.meta.url))],
  {
    env,
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true
  }
)
if (result.stdout) process.stdout.write(result.stdout)
if (result.status !== 0)
  throw new Error(result.error?.message || result.stderr || `Electron exited with ${result.status}`)
