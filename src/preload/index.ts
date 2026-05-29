import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  EncodingOptions,
  EncodingProgressPayload,
  EncodingLogPayload,
  EncodingCompletePayload,
  EncodingErrorPayload,
  MediaInfo
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
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
      ipcRenderer.invoke(channel, ...args)
  },
  process: {
    platform: process.platform,
    versions: process.versions,
    env: { ...process.env }
  }
}

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

// Custom APIs for renderer
const api = {
  selectFolder: () => invoke<string | null>('select-folder'),
  readVideoFiles: (folderPath: string) => invoke<VideoFile[]>('read-video-files', folderPath),
  // FFmpeg-related APIs
  checkFfmpeg: (ffmpegPath?: string) => invoke<FfmpegStatus>('check-ffmpeg', ffmpegPath),
  checkNvidiaSupport: (ffmpegPath?: string) => invoke<boolean>('check-nvidia-support', ffmpegPath),
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
