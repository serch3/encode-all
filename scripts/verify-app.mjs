import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const result = spawnSync(
  process.env.ELECTRON_BINARY || require('electron'),
  [fileURLToPath(new URL('app-smoke.mjs', import.meta.url))],
  {
    env,
    encoding: 'utf8',
    timeout: 90_000,
    windowsHide: true
  }
)
if (result.stdout) process.stdout.write(result.stdout)
if (result.status !== 0)
  throw new Error(result.error?.message || result.stderr || `Electron exited with ${result.status}`)
