import type { CustomAPI } from './api.types'

export interface RendererElectronAPI {
  process: {
    platform: string
    versions: Record<string, string | undefined>
  }
}

declare global {
  interface Window {
    electron: RendererElectronAPI
    api: CustomAPI
  }
}

export type { CustomAPI } from './api.types'
export {}
