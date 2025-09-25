import { ElectronAPI } from '@electron-toolkit/preload'

interface CustomAPI {
  selectFolder: () => Promise<string | null>
  readVideoFiles: (folderPath: string) => Promise<
    Array<{
      name: string
      path: string
      size: number
      modified: number
    }>
  >
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
