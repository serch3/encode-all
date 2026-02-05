import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  EncodingOptions,
  EncodingProgressPayload,
  EncodingLogPayload,
  EncodingCompletePayload,
  EncodingErrorPayload
} from './api.types'
import { join } from 'path'

// Custom APIs for renderer
// Note: Use electronAPI directly instead of window.electron here because
// window.electron hasn't been attached/exposed yet at definition time.
const api = {
  selectFolder: () => electronAPI.ipcRenderer.invoke('select-folder'),
  readVideoFiles: (folderPath: string) =>
    electronAPI.ipcRenderer.invoke('read-video-files', folderPath),
  // FFmpeg-related APIs
  checkFfmpeg: () => electronAPI.ipcRenderer.invoke('check-ffmpeg'),
  checkNvidiaSupport: () => electronAPI.ipcRenderer.invoke('check-nvidia-support'),
  selectFfmpegPath: () => electronAPI.ipcRenderer.invoke('select-ffmpeg-path'),
  openExternal: (url: string) => electronAPI.ipcRenderer.invoke('open-external', url),

  // Encoding APIs
  startEncoding: (options: EncodingOptions & { jobId?: string }) =>
    electronAPI.ipcRenderer.invoke('start-encoding', options),
  cancelEncoding: (jobId?: string) => electronAPI.ipcRenderer.invoke('cancel-encoding', jobId),
  onEncodingProgress: (callback: (payload: EncodingProgressPayload) => void) => {
    const subscription = (_event: IpcRendererEvent, payload: EncodingProgressPayload) =>
      callback(payload)
    ipcRenderer.on('encoding-progress', subscription)
    return () => ipcRenderer.removeListener('encoding-progress', subscription)
  },
  onEncodingLog: (callback: (payload: EncodingLogPayload) => void) => {
    const subscription = (_event: IpcRendererEvent, payload: EncodingLogPayload) =>
      callback(payload)
    ipcRenderer.on('encoding-log', subscription)
    return () => ipcRenderer.removeListener('encoding-log', subscription)
  },
  onEncodingComplete: (callback: (payload: EncodingCompletePayload) => void) => {
    const subscription = (_event: IpcRendererEvent, payload: EncodingCompletePayload) =>
      callback(payload)
    ipcRenderer.on('encoding-complete', subscription)
    return () => ipcRenderer.removeListener('encoding-complete', subscription)
  },
  onEncodingError: (callback: (payload: EncodingErrorPayload) => void) => {
    const subscription = (_event: IpcRendererEvent, payload: EncodingErrorPayload) =>
      callback(payload)
    ipcRenderer.on('encoding-error', subscription)
    return () => ipcRenderer.removeListener('encoding-error', subscription)
  },
  removeEncodingListeners: () => {
    ipcRenderer.removeAllListeners('encoding-progress')
    ipcRenderer.removeAllListeners('encoding-log')
    ipcRenderer.removeAllListeners('encoding-complete')
    ipcRenderer.removeAllListeners('encoding-error')
  },
  pathJoin: (...paths: string[]) => Promise.resolve(join(...paths)),
  saveTextFile: async (content: string, defaultName?: string) => {
    return electronAPI.ipcRenderer.invoke('save-text-file', content, defaultName)
  },
  readTextFile: async () => {
    return electronAPI.ipcRenderer.invoke('read-text-file')
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
