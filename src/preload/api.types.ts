export interface CustomAPI {
  selectFolder: () => Promise<string | null>
  readVideoFiles: (folderPath: string) => Promise<
    Array<{
      name: string
      path: string
      size: number
      modified: number
    }>
  >
  checkFfmpeg: () => Promise<{
    isInstalled: boolean
    version?: string
    path?: string
    error?: string
  }>
  checkNvidiaSupport: () => Promise<boolean>
  selectFfmpegPath: () => Promise<string | null>
  openExternal: (url: string) => Promise<void>
}
