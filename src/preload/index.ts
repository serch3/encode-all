import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
// Note: Use electronAPI directly instead of window.electron here because
// window.electron hasn't been attached/exposed yet at definition time.
const api = {
  selectFolder: () => electronAPI.ipcRenderer.invoke('select-folder'),
  readVideoFiles: (folderPath: string) =>
    electronAPI.ipcRenderer.invoke('read-video-files', folderPath)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
