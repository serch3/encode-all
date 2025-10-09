import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
// Note: Use electronAPI directly instead of window.electron here because
// window.electron hasn't been attached/exposed yet at definition time.
const api = {
  selectFolder: () => electronAPI.ipcRenderer.invoke('select-folder'),
  readVideoFiles: (folderPath: string) =>
    electronAPI.ipcRenderer.invoke('read-video-files', folderPath),
  // FFmpeg-related APIs
  checkFfmpeg: () => electronAPI.ipcRenderer.invoke('check-ffmpeg'),
  selectFfmpegPath: () => electronAPI.ipcRenderer.invoke('select-ffmpeg-path'),
  openExternal: (url: string) => electronAPI.ipcRenderer.invoke('open-external', url)
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
