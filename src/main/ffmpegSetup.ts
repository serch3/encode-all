import { spawn } from 'child_process'
import { access, readdir, realpath } from 'fs/promises'
import { dirname, join, win32 } from 'path'
import type { FfmpegInstaller, FfmpegStatus } from '../preload/api.types'

export function runBinary(
  executable: string,
  args: string[],
  timeoutMs = 10_000,
  onOutput?: (output: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timeout = setTimeout(() => {
      proc.kill()
      settle(() => reject(new Error(`${executable} timed out`)))
    }, timeoutMs)
    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }
    proc.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      stdout = (stdout + output).slice(-1_000_000)
      onOutput?.(output)
    })
    proc.stderr?.on('data', (data: Buffer) => {
      const output = data.toString()
      stderr = (stderr + output).slice(-16_000)
      onOutput?.(output)
    })
    proc.on('error', (error) => settle(() => reject(error)))
    proc.on('close', (code) =>
      settle(() =>
        code === 0
          ? resolve(stdout)
          : reject(new Error(`${executable} exited with code ${code}: ${stderr || stdout}`))
      )
    )
  })
}

export function commonFfmpegPaths(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (platform === 'darwin') {
    return ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/local/bin/ffmpeg']
  }
  if (platform === 'win32') {
    const paths: string[] = []
    if (env.LOCALAPPDATA) {
      paths.push(win32.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'))
    }
    if (env.ProgramFiles) {
      paths.push(win32.join(env.ProgramFiles, 'WinGet', 'Links', 'ffmpeg.exe'))
    }
    paths.push('C:\\ffmpeg\\bin\\ffmpeg.exe')
    return paths
  }
  return ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/snap/bin/ffmpeg']
}

async function locateExecutable(name: string): Promise<string | undefined> {
  if (process.platform === 'win32') {
    // Reading PATH directly avoids the OEM-codepage output of where.exe.
    const filename = name.toLowerCase().endsWith('.exe') ? name : `${name}.exe`
    for (const entry of (process.env.PATH ?? process.env.Path ?? '').split(';')) {
      const directory = entry.trim().replace(/^"|"$/g, '')
      if (!directory) continue
      const candidate = win32.join(directory, filename)
      try {
        await access(candidate)
        return candidate
      } catch {
        /* Try the next PATH entry. */
      }
    }
    return undefined
  }
  try {
    const output = await runBinary('which', [name])
    return output.trim().split(/\r?\n/)[0] || undefined
  } catch {
    return undefined
  }
}

async function wingetPackagePaths(): Promise<string[]> {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return []
  const root = join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages')
  try {
    const packages = (await readdir(root)).filter((name) => name.startsWith('Gyan.FFmpeg_'))
    const paths: string[] = []
    for (const name of packages) {
      const packageRoot = join(root, name)
      for (const folder of await readdir(packageRoot, { withFileTypes: true })) {
        if (folder.isDirectory()) paths.push(join(packageRoot, folder.name, 'bin', 'ffmpeg.exe'))
      }
    }
    return paths
  } catch {
    return []
  }
}

export async function resolveFfprobePath(ffmpegPath?: string): Promise<string> {
  if (ffmpegPath) {
    const resolved = await realpath(ffmpegPath).catch(() => ffmpegPath)
    const sibling = join(
      dirname(resolved),
      process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
    )
    try {
      await access(sibling)
      return sibling
    } catch {
      // A renamed FFmpeg executable still uses a sibling named ffprobe.
    }
  }
  return (await locateExecutable('ffprobe')) || 'ffprobe'
}

export async function checkFfmpegInstallation(customPath?: string): Promise<FfmpegStatus> {
  const candidates = customPath
    ? [customPath]
    : [
        ...new Set([
          (await locateExecutable('ffmpeg')) || 'ffmpeg',
          ...commonFfmpegPaths(),
          ...(await wingetPackagePaths())
        ])
      ]
  let error = 'FFmpeg and FFprobe were not found. Install them or select an existing executable.'
  let incomplete: FfmpegStatus | undefined
  for (const candidate of candidates) {
    try {
      const output = await runBinary(candidate, ['-version'])
      const version = output.match(/ffmpeg version ([^\s]+)/)?.[1]
      if (!version) throw new Error('Selected executable is not FFmpeg')
      const path = await realpath(candidate).catch(() => candidate)
      const ffprobePath = await resolveFfprobePath(path)
      try {
        const probeOutput = await runBinary(ffprobePath, ['-version'])
        if (!probeOutput.includes('ffprobe version')) throw new Error('Invalid FFprobe executable')
      } catch {
        incomplete = {
          isInstalled: false,
          path,
          version,
          error:
            'FFmpeg was found, but FFprobe is missing. Install both tools or place FFprobe beside FFmpeg.'
        }
        continue
      }
      return { isInstalled: true, version, path, ffprobePath }
    } catch (cause) {
      if (customPath) error = cause instanceof Error ? cause.message : String(cause)
    }
  }
  return incomplete ?? { isInstalled: false, error }
}

async function probeNvidiaEncoder(
  ffmpegPath: string | undefined,
  encoder: string
): Promise<boolean> {
  try {
    // A compiled-in encoder does not establish that a compatible GPU/driver exists.
    await runBinary(ffmpegPath || 'ffmpeg', [
      '-hide_banner',
      '-nostdin',
      '-f',
      'lavfi',
      '-i',
      'color=size=128x128:rate=1',
      '-frames:v',
      '1',
      '-c:v',
      encoder,
      '-f',
      'null',
      '-'
    ])
    return true
  } catch {
    return false
  }
}

export function checkNvidiaSupport(ffmpegPath?: string): Promise<boolean> {
  return probeNvidiaEncoder(ffmpegPath, 'h264_nvenc')
}

export async function getSupportedNvidiaEncoders(ffmpegPath?: string): Promise<string[]> {
  try {
    const output = await runBinary(ffmpegPath || 'ffmpeg', ['-hide_banner', '-encoders'])
    const supported: string[] = []
    for (const encoder of ['h264_nvenc', 'hevc_nvenc', 'av1_nvenc']) {
      if (!new RegExp(`^\\s*V\\S*\\s+${encoder}\\s`, 'm').test(output)) continue
      // Probe sequentially to avoid consuming multiple GPU encoder sessions.
      if (await probeNvidiaEncoder(ffmpegPath, encoder)) supported.push(encoder)
    }
    return supported
  } catch {
    return []
  }
}

async function packageManagerPath(manager: 'winget' | 'brew'): Promise<string | undefined> {
  const located = await locateExecutable(manager)
  if (located) return located
  const candidates =
    manager === 'brew'
      ? ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']
      : process.env.LOCALAPPDATA
        ? [join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'winget.exe')]
        : []
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      /* Try the next standard location. */
    }
  }
  return undefined
}

const WINGET_ARGS = [
  'install',
  '--id',
  'Gyan.FFmpeg',
  '--exact',
  '--source',
  'winget',
  '--scope',
  'user',
  '--silent',
  '--accept-package-agreements',
  '--accept-source-agreements',
  '--disable-interactivity'
]

export async function getFfmpegInstaller(): Promise<FfmpegInstaller> {
  const manager =
    process.platform === 'win32' ? 'winget' : process.platform === 'darwin' ? 'brew' : null
  if (!manager) {
    return {
      available: false,
      manager,
      reason:
        'Install FFmpeg and FFprobe with your distribution’s package manager. Debian/Ubuntu: sudo apt install ffmpeg. Arch: sudo pacman -S ffmpeg. On Fedora, ffmpeg-free is available, but additional codecs may need extra repositories.'
    }
  }
  const available = Boolean(await packageManagerPath(manager))
  return {
    available,
    manager,
    command: manager === 'winget' ? `winget ${WINGET_ARGS.join(' ')}` : 'brew install ffmpeg',
    reason: available
      ? undefined
      : manager === 'winget'
        ? 'Install Microsoft App Installer to enable WinGet, or select an existing FFmpeg installation.'
        : 'Install Homebrew first, or select an existing FFmpeg installation.'
  }
}

let installation: Promise<FfmpegStatus> | undefined

export function installFfmpeg(onOutput: (output: string) => void): Promise<FfmpegStatus> {
  if (installation) return installation
  installation = (async () => {
    const existing = await checkFfmpegInstallation()
    if (existing.isInstalled) return existing
    const installer = await getFfmpegInstaller()
    if (!installer.available || !installer.manager) throw new Error(installer.reason)
    const executable = await packageManagerPath(installer.manager)
    if (!executable) throw new Error('Package manager is unavailable')
    await runBinary(
      executable,
      installer.manager === 'winget' ? WINGET_ARGS : ['install', 'ffmpeg'],
      20 * 60_000,
      onOutput
    )
    // Re-discover absolute paths: this process's PATH predates the installation.
    const status = await checkFfmpegInstallation()
    if (!status.isInstalled) throw new Error(status.error)
    return status
  })().finally(() => {
    installation = undefined
  })
  return installation
}
