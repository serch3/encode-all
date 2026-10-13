import { EventEmitter } from 'events'
import { spawn } from 'child_process'
import { access, realpath } from 'fs/promises'
import { join } from 'path'
import {
  checkFfmpegInstallation,
  checkNvidiaSupport,
  getSupportedNvidiaEncoders,
  commonFfmpegPaths,
  installFfmpeg,
  resolveFfprobePath,
  runBinary
} from '../ffmpegSetup'

jest.mock('child_process', () => ({ spawn: jest.fn() }))
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  realpath: jest.fn(),
  readdir: async () => []
}))

function respond(output: (executable: string, args: string[]) => string): void {
  ;(spawn as jest.Mock).mockImplementation((executable, args) => {
    const proc = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: jest.fn()
    })
    process.nextTick(() => {
      try {
        proc.stdout.emit('data', Buffer.from(output(executable, args)))
        proc.emit('close', 0)
      } catch (error) {
        proc.emit('error', error)
      }
    })
    return proc
  })
}

beforeEach(() => {
  ;(access as jest.Mock).mockResolvedValue(undefined)
  ;(realpath as jest.Mock).mockImplementation(async (path) => path)
})

test('offers only NVENC codecs that the actual GPU can encode', async () => {
  respond((_executable, args) => {
    if (args.includes('-encoders'))
      return ' V....D h264_nvenc NVIDIA\n V....D hevc_nvenc NVIDIA\n V....D av1_nvenc NVIDIA\n'
    if (args.includes('av1_nvenc')) throw new Error('GPU does not support AV1 encoding')
    return ''
  })
  await expect(getSupportedNvidiaEncoders('/custom/ffmpeg')).resolves.toEqual([
    'h264_nvenc',
    'hevc_nvenc'
  ])
})

test('includes Homebrew and WinGet locations when desktop PATH is incomplete', () => {
  expect(commonFfmpegPaths('darwin')).toContain('/opt/homebrew/bin/ffmpeg')
  expect(commonFfmpegPaths('win32', { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' })).toContain(
    'C:\\Users\\test\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe'
  )
})

test('verifies FFprobe beside an explicitly selected, renamed FFmpeg binary', async () => {
  respond((executable) =>
    /ffprobe(?:\.exe)?$/.test(executable) ? 'ffprobe version 8.0' : 'ffmpeg version 8.0'
  )
  const encoder = join('/custom', 'encoder')
  const probe = join('/custom', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
  await expect(checkFfmpegInstallation(encoder)).resolves.toMatchObject({
    isInstalled: true,
    path: encoder,
    ffprobePath: probe
  })
  await expect(resolveFfprobePath(encoder)).resolves.toBe(probe)
})

test('does not declare the installation ready when FFprobe is missing', async () => {
  respond((executable) => {
    if (/ffprobe(?:\.exe)?$/.test(executable)) throw new Error('ENOENT')
    return 'ffmpeg version 8.0'
  })
  await expect(checkFfmpegInstallation('/custom/ffmpeg')).resolves.toMatchObject({
    isInstalled: false,
    error: expect.stringContaining('FFprobe is missing')
  })
})

test('reports missing NVIDIA hardware even when a build has NVENC', async () => {
  respond(() => {
    throw new Error('Cannot load libcuda')
  })
  await expect(checkNvidiaSupport('/custom/ffmpeg')).resolves.toBe(false)
  expect(spawn).toHaveBeenCalledWith(
    '/custom/ffmpeg',
    expect.arrayContaining(['-frames:v', '1', '-c:v', 'h264_nvenc']),
    { windowsHide: true }
  )
})

test('passes user-controlled paths as an argument, without a shell', async () => {
  respond(() => 'ok')
  await runBinary('/custom/ffmpeg', ['-i', '$(touch hacked).mp4'])
  expect(spawn).toHaveBeenCalledWith('/custom/ffmpeg', ['-i', '$(touch hacked).mp4'], {
    windowsHide: true
  })
})

test('WinGet install uses a fixed package, user scope, and deduplicates concurrent requests', async () => {
  const originalPlatform = process.platform
  const originalPath = process.env.PATH
  process.env.PATH = 'C:\\Tools'
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  try {
    let installed = false
    respond((executable, args) => {
      if (args[0] === 'install') {
        installed = true
        return 'Installed successfully\n'
      }
      if (!installed) throw new Error('ENOENT')
      return executable.endsWith('ffprobe.exe') ? 'ffprobe version 8.0' : 'ffmpeg version 8.0'
    })
    const first = installFfmpeg(jest.fn())
    expect(installFfmpeg(jest.fn())).toBe(first)
    await expect(first).resolves.toMatchObject({ isInstalled: true })
    expect(spawn).toHaveBeenCalledWith(
      'C:\\Tools\\winget.exe',
      expect.arrayContaining([
        'install',
        '--id',
        'Gyan.FFmpeg',
        '--exact',
        '--scope',
        'user',
        '--source',
        'winget',
        '--disable-interactivity'
      ]),
      { windowsHide: true }
    )
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
  }
})
