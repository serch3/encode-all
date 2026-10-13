import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rm, link, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

assert.equal(process.platform, 'win32', 'Run this check with Windows Node.js')
const directory = await mkdtemp(join(tmpdir(), 'encode-all-windows-'))
const savedPath = process.env.PATH
const savedLocalAppData = process.env.LOCALAPPDATA

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function copyBinary(source, destination) {
  await link(source, destination).catch(() => copyFile(source, destination))
}

try {
  const source = await readFile(new URL('../src/main/ffmpegSetup.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const modulePath = join(directory, 'ffmpeg-setup.cjs')
  await writeFile(modulePath, compiled)
  const { checkFfmpegInstallation, getFfmpegInstaller, getSupportedNvidiaEncoders } = createRequire(
    import.meta.url
  )(modulePath)
  const installed = await checkFfmpegInstallation(process.env.FFMPEG_PATH)
  assert.ok(installed.isInstalled, installed.error)
  assert.ok(win32.isAbsolute(installed.path), 'FFmpeg must resolve to an absolute path')
  assert.ok(win32.isAbsolute(installed.ffprobePath), 'FFprobe must resolve to an absolute path')
  const installer = await getFfmpegInstaller()
  assert.equal(installer.manager, 'winget')
  assert.match(installer.command, /--scope user/)
  console.log(
    `Windows FFmpeg ${installed.version}; WinGet ${installer.available ? 'available' : 'unavailable (manual setup supported)'}`
  )
  const encoders = await getSupportedNvidiaEncoders(installed.path)
  console.log(
    `Usable NVIDIA codecs: ${encoders.join(', ') || 'none; software encoding remains available'}`
  )

  const customDirectory = join(directory, 'Custom 日本語 é & install')
  await mkdir(customDirectory)
  const customEncoder = join(customDirectory, 'my encoder.exe')
  await copyBinary(installed.path, customEncoder)
  await copyBinary(installed.ffprobePath, join(customDirectory, 'ffprobe.exe'))
  const custom = await checkFfmpegInstallation(customEncoder)
  assert.ok(custom.isInstalled, custom.error)
  assert.equal(custom.ffprobePath.toLowerCase(), join(customDirectory, 'ffprobe.exe').toLowerCase())
  console.log('Renamed executable and Unicode paths verified')

  const localAppData = join(directory, 'Profile 日本語 & test')
  const links = join(localAppData, 'Microsoft', 'WinGet', 'Links')
  await mkdir(links, { recursive: true })
  await copyBinary(installed.path, join(links, 'ffmpeg.exe'))
  await copyBinary(installed.ffprobePath, join(links, 'ffprobe.exe'))
  process.env.LOCALAPPDATA = localAppData
  process.env.PATH = join(process.env.SystemRoot || 'C:\\Windows', 'System32')
  const discovered = await checkFfmpegInstallation()
  assert.ok(discovered.isInstalled, discovered.error)
  assert.equal(discovered.path.toLowerCase(), join(links, 'ffmpeg.exe').toLowerCase())
  console.log('WinGet discovery with stale PATH verified')
} finally {
  if (savedPath === undefined) delete process.env.PATH
  else process.env.PATH = savedPath
  if (savedLocalAppData === undefined) delete process.env.LOCALAPPDATA
  else process.env.LOCALAPPDATA = savedLocalAppData
  await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
