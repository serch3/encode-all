import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import {
  EncodingOptions,
  EncodingProgressPayload,
  EncodingLogPayload,
  EncodingCompletePayload,
  EncodingErrorPayload,
  MediaInfo,
  CustomAPI,
  FfmpegInstaller,
  PreviewOptions,
  PreviewResult,
  BatchReviewRequest,
  BatchReviewEntry,
  EncodingHistoryEntry,
  VideoFileInfo,
  UpdateState
} from './api.types'

type VideoFile = {
  name: string
  path: string
  size: number
  modified: number
}

type FfmpegStatus = {
  isInstalled: boolean
  version?: string
  path?: string
  error?: string
}

const electronAPI = {
  process: {
    platform: process.platform,
    versions: process.versions
  }
}

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

const pendingNativeImports: string[][] = []
const nativeImportListeners = new Set<(paths: string[]) => void>()
ipcRenderer.on('native-import', (_event, paths: string[]) => {
  if (nativeImportListeners.size) for (const callback of nativeImportListeners) callback(paths)
  else pendingNativeImports.push(paths.slice(0, 20000))
})

// Custom APIs for renderer
const api: CustomAPI = {
  getUpdateState: () => invoke<UpdateState>('get-update-state'),
  checkForUpdates: (channel) => invoke<UpdateState>('check-for-updates', channel),
  downloadUpdate: () => invoke<UpdateState>('download-update'),
  installUpdate: () => invoke<void>('install-update'),
  onUpdateState: (callback) => {
    const listener = (_event: IpcRendererEvent, state: UpdateState): void => callback(state)
    ipcRenderer.on('update-state', listener)
    return () => ipcRenderer.removeListener('update-state', listener)
  },
  onNativeImport: (callback) => {
    nativeImportListeners.add(callback)
    for (const paths of pendingNativeImports.splice(0)) callback(paths)
    return () => {
      nativeImportListeners.delete(callback)
    }
  },
  loadQueueState: () => invoke<unknown>('load-queue-state'),
  saveQueueState: (jobs) => invoke<void>('save-queue-state', jobs),
  getEncodingHistory: () => invoke<EncodingHistoryEntry[]>('get-encoding-history'),
  clearEncodingHistory: () => invoke<void>('clear-encoding-history'),
  openOutput: (id, reveal = false) => invoke<void>('open-output', id, reveal),
  setBatchProgress: (progress) => invoke<void>('set-batch-progress', progress),
  notifyBatchComplete: (successful, failed) =>
    invoke<void>('notify-batch-complete', successful, failed),
  selectVideoFiles: () => invoke<VideoFileInfo[]>('select-video-files'),
  importPaths: (paths) => invoke<VideoFileInfo[]>('import-paths', paths),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getFfmpegInstaller: () => invoke<FfmpegInstaller>('get-ffmpeg-installer'),
  installFfmpeg: () => invoke<FfmpegStatus>('install-ffmpeg'),
  onFfmpegInstallLog: (callback: (log: string) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, log: string): void => callback(log)
    ipcRenderer.on('ffmpeg-install-log', subscription)
    return () => ipcRenderer.removeListener('ffmpeg-install-log', subscription)
  },
  createPreview: (options: PreviewOptions) => invoke<PreviewResult>('create-preview', options),
  cancelPreview: () => invoke<void>('cancel-preview'),
  releasePreview: (id: string) => invoke<void>('release-preview', id),
  openPreview: (id: string) => invoke<void>('open-preview', id),
  openPreviewWindow: (id: string) => invoke<void>('open-preview-window', id),
  reviewBatchOutputs: (request: BatchReviewRequest) =>
    invoke<BatchReviewEntry[]>('review-batch-outputs', request),
  selectFolder: () => invoke<string | null>('select-folder'),
  readVideoFiles: (folderPath: string) => invoke<VideoFile[]>('read-video-files', folderPath),
  // FFmpeg-related APIs
  checkFfmpeg: (ffmpegPath?: string) => invoke<FfmpegStatus>('check-ffmpeg', ffmpegPath),
  checkNvidiaSupport: (ffmpegPath?: string) => invoke<boolean>('check-nvidia-support', ffmpegPath),
  getSupportedNvidiaEncoders: (ffmpegPath?: string) =>
    invoke<string[]>('get-nvidia-encoders', ffmpegPath),
  getSupportedEncoders: (path, refresh) =>
    invoke<string[]>('get-supported-encoders', path, refresh),
  selectFfmpegPath: () => invoke<string | null>('select-ffmpeg-path'),
  openExternal: (url: string) => invoke<void>('open-external', url),

  // Encoding APIs
  startEncoding: (options: EncodingOptions & { jobId?: string }) =>
    invoke<void>('start-encoding', options),
  cancelEncoding: (jobId?: string) => invoke<void>('cancel-encoding', jobId),
  onEncodingProgress: (callback: (payload: EncodingProgressPayload) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, payload: EncodingProgressPayload): void =>
      callback(payload)
    ipcRenderer.on('encoding-progress', subscription)
    return () => ipcRenderer.removeListener('encoding-progress', subscription)
  },
  onEncodingLog: (callback: (payload: EncodingLogPayload) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, payload: EncodingLogPayload): void =>
      callback(payload)
    ipcRenderer.on('encoding-log', subscription)
    return () => ipcRenderer.removeListener('encoding-log', subscription)
  },
  onEncodingComplete: (callback: (payload: EncodingCompletePayload) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, payload: EncodingCompletePayload): void =>
      callback(payload)
    ipcRenderer.on('encoding-complete', subscription)
    return () => ipcRenderer.removeListener('encoding-complete', subscription)
  },
  onEncodingError: (callback: (payload: EncodingErrorPayload) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, payload: EncodingErrorPayload): void =>
      callback(payload)
    ipcRenderer.on('encoding-error', subscription)
    return () => ipcRenderer.removeListener('encoding-error', subscription)
  },
  pathJoin: (...paths: string[]) => invoke<string>('path-join', paths),
  saveTextFile: async (content: string, defaultName?: string) => {
    return invoke<boolean>('save-text-file', content, defaultName)
  },
  readTextFile: async () => {
    return invoke<string | null>('read-text-file')
  },
  probeFile: async (filePath: string, ffmpegPath?: string): Promise<MediaInfo> => {
    return invoke<MediaInfo>('probe-file', filePath, ffmpegPath)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Failed to expose APIs to renderer:', errorMessage)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
