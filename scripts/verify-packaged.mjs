import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

if (!['win32', 'darwin'].includes(process.platform))
  throw new Error('Run this check on Windows or macOS.')
let executable = resolve('dist/win-unpacked/encode-all.exe')
if (process.platform === 'darwin') {
  for (const folder of (await readdir('dist', { withFileTypes: true }))
    .filter((item) => item.isDirectory() && item.name.startsWith('mac'))
    .sort((a, b) => Number(b.name.includes('universal')) - Number(a.name.includes('universal')))) {
    const app = (await readdir(join('dist', folder.name))).find((name) => name.endsWith('.app'))
    if (app) {
      executable = resolve('dist', folder.name, app, 'Contents/MacOS/Encode All')
      break
    }
  }
}
const server = createServer()
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const port = server.address().port
await new Promise((done) => server.close(done))
const directory = await mkdtemp(join(tmpdir(), 'encode-all-packaged-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(
  executable,
  [`--remote-debugging-port=${port}`, `--user-data-dir=${directory}`],
  { env, windowsHide: true, stdio: 'ignore' }
)
let startupError
child.on('error', (error) => {
  startupError = error
})
let socket
try {
  let page
  const deadline = Date.now() + 30000
  while (!page && Date.now() < deadline) {
    if (startupError) throw startupError
    if (child.exitCode !== null)
      throw new Error('Packaged app exited before its renderer was ready.')
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((response) => response.json())
      .catch(() => [])
    page = targets.find((target) => target.type === 'page' && target.url.startsWith('file:'))
    if (!page) await new Promise((done) => setTimeout(done, 200))
  }
  if (!page) throw new Error('Packaged app did not start.')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((done, fail) => {
    socket.addEventListener('open', done, { once: true })
    socket.addEventListener('error', fail, { once: true })
  })
  const result = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('Packaged IPC check timed out.')), 20000)
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      clearTimeout(timer)
      if (message.error || message.result?.exceptionDetails)
        fail(new Error(JSON.stringify(message)))
      else done(message.result.result.value)
    })
    socket.send(
      JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(async () => { const deadline = Date.now() + 10000; while (!window.api || !document.querySelector('#root')?.firstElementChild) { if (Date.now() > deadline) throw new Error('Renderer did not mount'); await new Promise((done) => setTimeout(done, 100)); } return { mounted: true, ffmpeg: await window.api.checkFfmpeg(${JSON.stringify(process.env.FFMPEG_PATH)}) }; })()`,
          awaitPromise: true,
          returnByValue: true
        }
      })
    )
  })
  if (!result.mounted || !result.ffmpeg?.isInstalled)
    throw new Error('Packaged renderer or preload/FFmpeg discovery failed.')
  console.log('Packaged app launch, renderer, preload IPC, and FFmpeg discovery verified')
} finally {
  const stopped = new Promise((done) => {
    if (child.exitCode !== null) done()
    else child.once('exit', done)
  })
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ id: 99, method: 'Browser.close' }))
  else child.kill()
  await Promise.race([stopped, new Promise((done) => setTimeout(done, 3000))])
  if (child.exitCode === null) child.kill()
  socket?.close()
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
    () => {}
  )
}
