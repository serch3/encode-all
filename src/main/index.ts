import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readdirSync, statSync, writeFileSync, readFileSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import icon from '../../resources/icon.png?asset'
import { startEncoding, cancelEncoding } from './ffmpeg'
import { EncodingOptions } from '../preload/api.types'

const execAsync = promisify(exec)

/**
 * Checks if FFmpeg is installed and available on the system.
 *
 * @returns Promise with FFmpeg installation status, version, and path
 *
 * @remarks
 * - Attempts to detect FFmpeg using `ffmpeg -version` command
 * - Tries to locate the executable path using platform-specific commands (where/which)
 */
async function checkFfmpegInstallation(): Promise<{
  isInstalled: boolean
  version?: string
  path?: string
  error?: string
}> {
  try {
    const { stdout } = await execAsync('ffmpeg -version')
    const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/)
    const version = versionMatch ? versionMatch[1] : 'Unknown'

    // Try to get the path - if this fails, the outer catch will handle it
    const { stdout: wherePath } = await execAsync(
      process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg'
    )
    const path = wherePath.trim().split('\n')[0]

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
async function checkNvidiaSupport(): Promise<boolean> {
  try {
    // Check if ffmpeg lists nvenc encoders
    const { stdout } = await execAsync('ffmpeg -hide_banner -encoders')
    return stdout.includes('nvenc')
  } catch (error) {
    console.error('Failed to check NVIDIA support:', error)
    return false
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
    const { stdout } = await execAsync(`"${selectedPath}" -version`)
    if (stdout.includes('ffmpeg version')) {
      return selectedPath
    } else {
      throw new Error('Selected file is not a valid FFmpeg executable')
    }
  } catch {
    throw new Error('Selected file is not a valid FFmpeg executable')
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
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
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
      const files = readdirSync(folderPath)
      const videoExtensions = [
        '.mp4',
        '.mkv',
        '.avi',
        '.mov',
        '.wmv',
        '.flv',
        '.webm',
        '.m4v',
        '.3gp'
      ]

      const videoFiles = files
        .filter((file) => {
          const ext = file.toLowerCase().substring(file.lastIndexOf('.'))
          return videoExtensions.includes(ext)
        })
        .map((file) => {
          const fullPath = join(folderPath, file)
          const stats = statSync(fullPath)
          return {
            name: file,
            path: fullPath,
            size: stats.size,
            modified: stats.mtime.getTime()
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      return videoFiles
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error reading video files:', errorMessage)
      throw new Error(`Failed to read video files from ${folderPath}: ${errorMessage}`)
    }
  })

  // FFmpeg-related IPC handlers
  ipcMain.handle('check-ffmpeg', async () => {
    return await checkFfmpegInstallation()
  })

  ipcMain.handle('check-nvidia-support', async () => {
    return await checkNvidiaSupport()
  })

  ipcMain.handle('select-ffmpeg-path', async () => {
    return await selectFfmpegExecutable()
  })

  ipcMain.handle('open-external', async (_, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('start-encoding', async (event, options: EncodingOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      startEncoding(options, window)
    }
  })

  ipcMain.handle('cancel-encoding', async () => {
    cancelEncoding()
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
