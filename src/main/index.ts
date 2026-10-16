import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  screen,
  Menu,
  Notification
} from 'electron'
import { join, basename, extname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { type Dirent, type Stats } from 'fs'
import { readdir, stat, readFile, writeFile } from 'fs/promises'
import { createStateStore } from './stateStore'
import { initializeHistory, getEncodingHistory, clearEncodingHistory } from './history'
import icon from '../../resources/icon.png?asset'
import { startEncoding, cancelEncoding, hasActiveEncodings, waitForEncodings } from './ffmpeg'
import { EncodingOptions, PreviewOptions, BatchReviewRequest } from '../preload/api.types'
import { reviewBatchOutputs } from './batchReview'
import { createReviewPlans } from './reviewPlans'
import {
  getUpdateState,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  onUpdateState
} from './updates'
import {
  checkFfmpegInstallation,
  checkNvidiaSupport,
  getSupportedNvidiaEncoders,
  getSupportedEncoders,
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
  openPreviewWindow,
  previewResponse,
  cleanupPreviews
} from './preview'

const trustedWindows = new Set<number>()
const reviewPlans = createReviewPlans()
let stateStore: ReturnType<typeof createStateStore>
let shutdownApproved = false
let closing = false
let savedBounds: Electron.Rectangle | undefined
const pendingOpenPaths: string[] = []
const profileDirectory = app.commandLine.getSwitchValue('user-data-dir')
if (profileDirectory && isAbsolute(profileDirectory)) app.setPath('userData', profileDirectory)

app.on('open-file', (event, path) => {
  event.preventDefault()
  pendingOpenPaths.push(path)
  const window = BrowserWindow.getAllWindows().find((item) =>
    trustedWindows.has(item.webContents.id)
  )
  if (window && !window.webContents.isLoading()) {
    window.webContents.send('native-import', pendingOpenPaths.splice(0))
    window.show()
  }
})
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', (_event, argv) => {
  const window = BrowserWindow.getAllWindows().find((item) =>
    trustedWindows.has(item.webContents.id)
  )
  const paths = argv.filter(
    (path) => isAbsolute(path) && VIDEO_EXTENSIONS.has(extname(path).toLowerCase())
  )
  if (window) {
    window.show()
    window.focus()
    window.webContents.send('native-import', paths)
  } else {
    pendingOpenPaths.push(...paths)
    if (stateStore) createWindow()
  }
})

const handle: typeof ipcMain.handle = (channel, listener) => {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trustedWindows.has(event.sender.id) || event.senderFrame !== event.sender.mainFrame)
      throw new Error('This request is not from the app workspace.')
    const url = new URL(event.senderFrame.url)
    const expected = process.env.ELECTRON_RENDERER_URL
    const trusted =
      is.dev && expected
        ? url.origin === new URL(expected).origin
        : url.protocol === 'file:' &&
          fileURLToPath(url) === join(__dirname, '../renderer/index.html')
    if (!trusted) throw new Error('Untrusted app origin.')
    return listener(event, ...args)
  })
}

async function approveShutdown(): Promise<boolean> {
  if (shutdownApproved || !hasActiveEncodings()) return true
  if (closing) return false
  closing = true
  try {
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'Stop encoding?',
      message: 'Encoding is still running.',
      detail:
        'Closing will stop active jobs. Your queue will be restored next time; interrupted videos will restart from the beginning.',
      buttons: ['Keep encoding', 'Stop and close'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (result.response !== 1) return false
    shutdownApproved = true
    cancelEncoding()
    await waitForEncodings()
    return true
  } finally {
    closing = false
  }
}

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
  shutdownApproved = false
  // Create the browser window.
  const area = screen.getDisplayMatching(
    savedBounds ?? { x: 0, y: 0, width: 1200, height: 800 }
  ).workArea
  const bounds = savedBounds
  const width = Math.min(area.width, Math.max(760, bounds?.width ?? 1200))
  const height = Math.min(area.height, Math.max(600, bounds?.height ?? 800))
  const mainWindow = new BrowserWindow({
    width,
    height,
    x: bounds ? Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)) : undefined,
    y: bounds ? Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)) : undefined,
    minWidth: Math.min(760, area.width),
    minHeight: Math.min(600, area.height),
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  trustedWindows.add(mainWindow.webContents.id)
  const contentsId = mainWindow.webContents.id
  mainWindow.on('close', (event) => {
    if (!shutdownApproved && hasActiveEncodings()) {
      event.preventDefault()
      void approveShutdown().then((approved) => {
        if (approved) mainWindow.close()
      })
    }
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      savedBounds = mainWindow.getBounds()
      void stateStore.write('window', savedBounds).catch(console.warn)
    }
  })
  mainWindow.on('closed', () => {
    trustedWindows.delete(contentsId)
    cancelEncoding()
    void cleanupPreviews()
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault()
  })
  mainWindow.webContents.once('did-finish-load', () => {
    // React attaches preload subscriptions after the document has loaded.
    if (pendingOpenPaths.length)
      mainWindow.webContents.send('native-import', pendingOpenPaths.splice(0))
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
app.whenReady().then(async () => {
  stateStore = createStateStore(join(app.getPath('userData'), 'state'))
  savedBounds = await stateStore
    .read('window')
    .then((saved) => {
      const bounds = saved as Electron.Rectangle | null
      return bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
        ? bounds
        : undefined
    })
    .catch(() => undefined)
  await initializeHistory(stateStore).catch(console.warn)
  protocol.handle('encode-preview', previewResponse)
  handle('get-ffmpeg-installer', getFfmpegInstaller)
  handle('install-ffmpeg', (event) =>
    installFfmpeg((log) => {
      if (!event.sender.isDestroyed()) event.sender.send('ffmpeg-install-log', log)
    })
  )
  handle('create-preview', (event, options: PreviewOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Preview window is unavailable')
    return createPreview(options, window)
  })
  handle('cancel-preview', cancelPreview)
  handle('release-preview', (_, id: string) => releasePreview(id))
  handle('open-preview', (_, id: string) => openPreview(id))
  handle('open-preview-window', async (event, id: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    if (!parent) throw new Error('The preview workspace is unavailable.')
    await openPreviewWindow(id, parent)
  })
  handle('review-batch-outputs', (_, request: BatchReviewRequest) =>
    reviewBatchOutputs(request).then((entries) => reviewPlans.issue(entries))
  )
  handle('load-queue-state', () => stateStore.read('queue'))
  handle('save-queue-state', (_, jobs: unknown[]) => {
    if (!Array.isArray(jobs) || jobs.length > 20000 || JSON.stringify(jobs).length > 30_000_000)
      throw new Error('This saved queue is too large or invalid.')
    return stateStore.write('queue', jobs)
  })
  handle('get-encoding-history', getEncodingHistory)
  onUpdateState((state) => {
    for (const window of BrowserWindow.getAllWindows())
      if (trustedWindows.has(window.webContents.id)) window.webContents.send('update-state', state)
  })
  handle('get-update-state', getUpdateState)
  handle('check-for-updates', (_, channel: 'stable' | 'beta') => checkForUpdates(channel))
  handle('download-update', downloadUpdate)
  handle('install-update', () =>
    installUpdate(async () => {
      await stateStore.flush()
      await cleanupPreviews()
      if (hasActiveEncodings()) throw new Error('Finish active encodes before installing.')
      quitReady = true
      shutdownApproved = true
    })
  )
  handle('clear-encoding-history', clearEncodingHistory)
  handle('open-output', async (_, id: string, reveal: boolean) => {
    const entry = (await getEncodingHistory()).find((item) => item.id === id)
    if (!entry) throw new Error('This output is no longer in history.')
    await stat(entry.outputPath)
    if (reveal) shell.showItemInFolder(entry.outputPath)
    else {
      const error = await shell.openPath(entry.outputPath)
      if (error) throw new Error(error)
    }
  })
  handle('set-batch-progress', (event, progress: number) => {
    if (!Number.isFinite(progress) || progress < -1 || progress > 1)
      throw new Error('Invalid progress.')
    BrowserWindow.fromWebContents(event.sender)?.setProgressBar(progress)
  })
  handle('notify-batch-complete', (_, successful: number, failed: number) => {
    if (![successful, failed].every((count) => Number.isInteger(count) && count >= 0)) return
    const mainWindow = BrowserWindow.getAllWindows().find((window) =>
      trustedWindows.has(window.webContents.id)
    )
    if (mainWindow?.isFocused() || !Notification.isSupported()) return
    const notification = new Notification({
      title: 'Encode All',
      body: `${successful} completed${failed ? `, ${failed} failed` : ''}.`
    })
    notification.on('click', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
    notification.show()
  })
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.serch3.encode-all')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  async function importPaths(
    paths: string[]
  ): Promise<Array<{ name: string; path: string; size: number; modified: number }>> {
    if (
      !Array.isArray(paths) ||
      paths.length > 20000 ||
      paths.some((path) => typeof path !== 'string' || !isAbsolute(path))
    )
      throw new Error('Choose local files or folders.')
    const files: Array<{ name: string; path: string; size: number; modified: number }> = []
    for (const path of paths) {
      const details = await stat(path)
      if (details.isDirectory()) files.push(...(await readVideoFilesRecursive(path)))
      else if (details.isFile() && VIDEO_EXTENSIONS.has(extname(path).toLowerCase()))
        files.push({ name: basename(path), path, size: details.size, modified: details.mtimeMs })
    }
    return [...new Map(files.map((file) => [file.path, file])).values()]
  }
  async function selectVideoFiles(): Promise<Awaited<ReturnType<typeof importPaths>>> {
    const result = await dialog.showOpenDialog({
      title: 'Add videos',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Videos', extensions: [...VIDEO_EXTENSIONS].map((extension) => extension.slice(1)) }
      ]
    })
    return result.canceled ? [] : importPaths(result.filePaths)
  }
  handle('select-video-files', selectVideoFiles)
  handle('import-paths', (_, paths: string[]) => importPaths(paths))
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'File',
        submenu: [
          {
            label: 'Add videos…',
            accelerator: 'CmdOrCtrl+O',
            click: () => {
              void selectVideoFiles()
                .then((files) => {
                  const window = BrowserWindow.getAllWindows().find((item) =>
                    trustedWindows.has(item.webContents.id)
                  )
                  window?.webContents.send(
                    'native-import',
                    files.map((file) => file.path)
                  )
                })
                .catch(console.warn)
            }
          },
          { type: 'separator' },
          { role: process.platform === 'darwin' ? 'close' : 'quit' }
        ]
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      {
        role: 'help',
        submenu: [
          {
            label: 'Report an issue',
            click: () => openAllowedExternalUrl('https://github.com/serch3/encode-all/issues')
          }
        ]
      }
    ])
  )
  // IPC handlers for folder reading
  handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.filePaths[0] || null
  })

  handle('read-video-files', async (_, folderPath: string) => {
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
  handle('check-ffmpeg', async (_, ffmpegPath?: string) => {
    return await checkFfmpegInstallation(ffmpegPath)
  })

  handle('check-nvidia-support', async (_, ffmpegPath?: string) => {
    return await checkNvidiaSupport(ffmpegPath)
  })
  handle('get-nvidia-encoders', (_, ffmpegPath?: string) => getSupportedNvidiaEncoders(ffmpegPath))
  handle('get-supported-encoders', (_, path?: string, refresh?: boolean) =>
    getSupportedEncoders(path, refresh)
  )

  handle('select-ffmpeg-path', async () => {
    return await selectFfmpegExecutable()
  })

  handle('open-external', async (_, url: string) => {
    openAllowedExternalUrl(url)
  })

  handle('path-join', async (_, paths: string[]) => {
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) {
      throw new Error('Invalid path arguments')
    }
    return join(...paths)
  })

  handle('start-encoding', async (event, options: EncodingOptions & { jobId?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      await reviewPlans.verify(options)
      const output = await startEncoding(options, window)
      if (output) reviewPlans.release(options.reviewToken)
    }
  })

  handle('cancel-encoding', async (_, jobId?: string) => {
    cancelEncoding(jobId)
  })

  handle('probe-file', async (_, filePath: string, ffmpegPath?: string) => {
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

  handle('save-text-file', async (_, content: string, defaultName: string = 'queue-state.json') => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Encoding Queue',
      defaultPath: defaultName,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })

    if (filePath) {
      // Use fs imports
      if (typeof content !== 'string' || content.length > 30_000_000)
        throw new Error('Queue file is too large.')
      await writeFile(filePath, content, 'utf-8')
      return true
    }
    return false
  })

  handle('read-text-file', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Load Encoding Queue',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    })

    if (filePaths && filePaths.length > 0) {
      if ((await stat(filePaths[0])).size > 30_000_000) throw new Error('Queue file is too large.')
      return readFile(filePaths[0], 'utf-8')
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

let quitReady = false
app.on('before-quit', (event) => {
  if (quitReady) return
  event.preventDefault()
  void (async () => {
    if (!(await approveShutdown())) return
    cancelEncoding()
    await waitForEncodings()
    await cleanupPreviews()
    await stateStore?.flush().catch(console.warn)
    quitReady = true
    app.quit()
  })()
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
