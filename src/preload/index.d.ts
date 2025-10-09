import { ElectronAPI } from '@electron-toolkit/preload'
import type { CustomAPI } from './api.types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}

export type { CustomAPI } from './api.types'
export {}
