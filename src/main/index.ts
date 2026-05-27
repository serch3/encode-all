import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { writeFileSync, readFileSync, type Dirent, type Stats } from 'fs'
import { readdir, stat } from 'fs/promises'
import { spawn } from 'child_process'
import icon from '../../resources/icon.png?asset'
import { startEncoding, cancelEncoding } from './ffmpeg'
import { EncodingOptions } from '../preload/api.types'

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.webm',
  '.m4v',
  '.3gp',
  '.ts'
])

/**
 * Checks if FFmpeg is installed and available on the system.
 *
 * @returns Promise with FFmpeg installation status, version, and path
 *
 * @remarks
 * - Attempts to detect FFmpeg using `ffmpeg -version` command
 * - Tries to locate the executable path using platform-specific commands (where/which)
 */
async function checkFfmpegInstallation(ffmpegPath?: string): Promise<{
  isInstalled: boolean
  version?: string
  path?: string
  error?: string
}> {
  const executable = ffmpegPath || 'ffmpeg'

  try {
    const stdout = await runBinary(executable, ['-version'])
    const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/)
    const version = versionMatch ? versionMatch[1] : 'Unknown'
    const path = ffmpegPath || (await locateExecutable('ffmpeg'))

    return {
      isInstalled: true,
      version,
      path
    }
  } catch (error) {
    return {
      isInstalled: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Checks if NVIDIA NVENC encoding is supported by the installed FFmpeg.
 *
 * @returns Promise with boolean indicating support
 */
async function checkNvidiaSupport(ffmpegPath?: string): Promise<boolean> {
  try {
    const stdout = await runBinary(ffmpegPath || 'ffmpeg', ['-hide_banner', '-encoders'])
    return stdout.includes('nvenc')
  } catch (error) {
    console.error('Failed to check NVIDIA support:', error)
    return false
  }
}

function runBinary(executable: string, args: string[], timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, args)
    let stdout = ''
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      proc.kill()
      settle(() => reject(new Error(`${executable} timed out after ${timeoutMs}ms`)))
    }, timeoutMs)

    function settle(callback: () => void): void {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })
    proc.on('close', (code) => {
      if (code === 0) {
        settle(() => resolve(stdout))
        return
      }
      settle(() => reject(new Error(`${executable} exited with code ${code}: ${stderr}`)))
    })
    proc.on('error', (error) => {
      settle(() => reject(error))
    })
  })
}

async function locateExecutable(executable: string): Promise<string | undefined> {
  try {
    const locator = process.platform === 'win32' ? 'where' : 'which'
    const stdout = await runBinary(locator, [executable], 5_000)
    return stdout.trim().split(/\r?\n/)[0]
  } catch {
    return undefined
  }
}

/**
 * Opens a file dialog to allow the user to select an FFmpeg executable.
 *
 * @returns Promise with the selected file path or null if cancelled
 *
 * @remarks
 * - Uses platform-specific file filters (.exe for Windows, all files for Unix-like systems)
 * - Returns null if the user cancels the dialog
 */
async function selectFfmpegExecutable(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select FFmpeg Executable',
    filters: [
      { name: 'Executable Files', extensions: process.platform === 'win32' ? ['exe'] : ['*'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const selectedPath = result.filePaths[0]

  // Verify it's actually FFmpeg
  try {
    const stdout = await runBinary(selectedPath, ['-version'])
    if (!stdout.includes('ffmpeg version')) {
      throw new Error('Selected file is not a valid FFmpeg executable')
    }
    return selectedPath
  } catch {
    throw new Error('Selected file is not a valid FFmpeg executable')
  }
}

function openAllowedExternalUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      shell.openExternal(parsed.toString())
    }
  } catch {
    // invalid or disallowed URL - silently ignore
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    openAllowedExternalUrl(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.encode-all.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // IPC handlers for folder reading
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.filePaths[0] || null
  })

  ipcMain.handle('read-video-files', async (_, folderPath: string) => {
    try {
      const videoFiles = await readVideoFilesRecursive(folderPath)
      return videoFiles.sort((a, b) => a.path.localeCompare(b.path))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error reading video files:', errorMessage)
      throw new Error(`Failed to read video files from ${folderPath}: ${errorMessage}`)
    }
  })

  async function readVideoFilesRecursive(folderPath: string): Promise<
    Array<{
      name: string
      path: string
      size: number
      modified: number
    }>
  > {
    let entries: Dirent[]
    try {
      entries = await readdir(folderPath, { withFileTypes: true })
    } catch (error) {
      console.warn(
        `Skipping unreadable folder ${folderPath}:`,
        error instanceof Error ? error.message : error
      )
      return []
    }

    const nestedFiles = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(folderPath, entry.name)

        if (entry.isDirectory()) {
          return readVideoFilesRecursive(fullPath)
        }

        if (!entry.isFile()) {
          return []
        }

        const dotIndex = entry.name.lastIndexOf('.')
        const ext = dotIndex >= 0 ? entry.name.substring(dotIndex).toLowerCase() : ''
        if (!VIDEO_EXTENSIONS.has(ext)) {
          return []
        }

        let stats: Stats
        try {
          stats = await stat(fullPath)
        } catch (error) {
          console.warn(
            `Skipping unreadable file ${fullPath}:`,
            error instanceof Error ? error.message : error
          )
          return []
        }

        return [
          {
            name: entry.name,
            path: fullPath,
            size: stats.size,
            modified: stats.mtime.getTime()
          }
        ]
      })
    )

    return nestedFiles.flat()
  }

  // FFmpeg-related IPC handlers
  ipcMain.handle('check-ffmpeg', async (_, ffmpegPath?: string) => {
    return await checkFfmpegInstallation(ffmpegPath)
  })

  ipcMain.handle('check-nvidia-support', async (_, ffmpegPath?: string) => {
    return await checkNvidiaSupport(ffmpegPath)
  })

  ipcMain.handle('select-ffmpeg-path', async () => {
    return await selectFfmpegExecutable()
  })

  ipcMain.handle('open-external', async (_, url: string) => {
    openAllowedExternalUrl(url)
  })

  ipcMain.handle('path-join', async (_, paths: string[]) => {
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) {
      throw new Error('Invalid path arguments')
    }
    return join(...paths)
  })

  ipcMain.handle('start-encoding', async (event, options: EncodingOptions & { jobId?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      await startEncoding(options, window)
    }
  })

  ipcMain.handle('cancel-encoding', async (_, jobId?: string) => {
    cancelEncoding(jobId)
  })

  ipcMain.handle('probe-file', async (_, filePath: string, ffmpegPath?: string) => {
    // Derive ffprobe path: replace the ffmpeg binary name with ffprobe
    const probeBin = ffmpegPath
      ? ffmpegPath.replace(/ffmpeg(\.exe)?$/i, (_, ext) => `ffprobe${ext ?? ''}`)
      : 'ffprobe'
    // Use spawn with an args array to prevent shell injection via filePath
    const stdout = await runBinary(
      probeBin,
      ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filePath],
      20_000
    )

    try {
      return JSON.parse(stdout)
    } catch (error) {
      throw new Error(`Failed to parse ffprobe output: ${error}`)
    }
  })

  ipcMain.handle(
    'save-text-file',
    async (_, content: string, defaultName: string = 'queue-state.json') => {
      const { filePath } = await dialog.showSaveDialog({
        title: 'Save Encoding Queue',
        defaultPath: defaultName,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      })

      if (filePath) {
        // Use fs imports
        writeFileSync(filePath, content, 'utf-8')
        return true
      }
      return false
    }
  )

  ipcMain.handle('read-text-file', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Load Encoding Queue',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    })

    if (filePaths && filePaths.length > 0) {
      return readFileSync(filePaths[0], 'utf-8')
    }
    return null
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
