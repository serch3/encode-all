import { app, shell, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { writeFileSync, readFileSync, type Dirent, type Stats } from 'fs'
import { readdir, stat } from 'fs/promises'
import icon from '../../resources/icon.png?asset'
import { startEncoding, cancelEncoding } from './ffmpeg'
import { EncodingOptions, PreviewOptions } from '../preload/api.types'
import {
  checkFfmpegInstallation,
  checkNvidiaSupport,
  runBinary,
  resolveFfprobePath,
  getFfmpegInstaller,
  installFfmpeg
} from './ffmpegSetup'
import {
  createPreview,
  cancelPreview,
  releasePreview,
  openPreview,
  previewResponse,
  cleanupPreviews
} from './preview'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'encode-preview',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
  }
])

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

  mainWindow.on('closed', () => {
    cancelEncoding()
    void cleanupPreviews()
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault()
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
  protocol.handle('encode-preview', previewResponse)
  ipcMain.handle('get-ffmpeg-installer', getFfmpegInstaller)
  ipcMain.handle('install-ffmpeg', (event) =>
    installFfmpeg((log) => {
      if (!event.sender.isDestroyed()) event.sender.send('ffmpeg-install-log', log)
    })
  )
  ipcMain.handle('create-preview', (event, options: PreviewOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Preview window is unavailable')
    return createPreview(options, window)
  })
  ipcMain.handle('cancel-preview', cancelPreview)
  ipcMain.handle('release-preview', (_, id: string) => releasePreview(id))
  ipcMain.handle('open-preview', (_, id: string) => openPreview(id))
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.serch3.encode-all')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

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
    // Report errors for the selected folder; unreadable nested folders can be skipped.
    const rootEntries = await readdir(folderPath, { withFileTypes: true })
    const SCAN_CONCURRENCY = 8
    const pendingFolders = [folderPath]
    const videoFiles: Array<{
      name: string
      path: string
      size: number
      modified: number
    }> = []
    let activeScans = 0

    const scanFolder = async (currentFolder: string): Promise<void> => {
      let entries: Dirent[]
      try {
        entries =
          currentFolder === folderPath
            ? rootEntries
            : await readdir(currentFolder, { withFileTypes: true })
      } catch (error) {
        console.warn(
          `Skipping unreadable folder ${currentFolder}:`,
          error instanceof Error ? error.message : error
        )
        return
      }

      for (const entry of entries) {
        const fullPath = join(currentFolder, entry.name)

        if (entry.isDirectory()) {
          pendingFolders.push(fullPath)
          continue
        }

        if (!entry.isFile()) {
          continue
        }

        const dotIndex = entry.name.lastIndexOf('.')
        const ext = dotIndex >= 0 ? entry.name.substring(dotIndex).toLowerCase() : ''
        if (!VIDEO_EXTENSIONS.has(ext)) {
          continue
        }

        let stats: Stats
        try {
          stats = await stat(fullPath)
        } catch (error) {
          console.warn(
            `Skipping unreadable file ${fullPath}:`,
            error instanceof Error ? error.message : error
          )
          continue
        }

        videoFiles.push({
          name: entry.name,
          path: fullPath,
          size: stats.size,
          modified: stats.mtime.getTime()
        })
      }
    }

    await new Promise<void>((resolve) => {
      const schedule = (): void => {
        while (activeScans < SCAN_CONCURRENCY && pendingFolders.length > 0) {
          const currentFolder = pendingFolders.shift()
          if (!currentFolder) continue

          activeScans += 1
          void scanFolder(currentFolder).finally(() => {
            activeScans -= 1
            if (pendingFolders.length === 0 && activeScans === 0) {
              resolve()
              return
            }
            schedule()
          })
        }

        if (pendingFolders.length === 0 && activeScans === 0) {
          resolve()
        }
      }

      schedule()
    })

    return videoFiles
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
    const probeBin = await resolveFfprobePath(ffmpegPath)
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

app.on('before-quit', () => {
  cancelEncoding()
  void cleanupPreviews()
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
