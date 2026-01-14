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
  startEncoding: (options: EncodingOptions) => Promise<void>
  cancelEncoding: () => Promise<void>
  onEncodingProgress: (callback: (progress: number) => void) => () => void
  onEncodingLog: (callback: (log: string) => void) => () => void
  onEncodingComplete: (callback: () => void) => () => void
  onEncodingError: (callback: (error: string) => void) => () => void
  removeEncodingListeners: () => void
  pathJoin: (...paths: string[]) => Promise<string>
  saveTextFile: (content: string, defaultName?: string) => Promise<boolean>
  readTextFile: () => Promise<string | null>
}

export interface EncodingOptions {
  inputPath: string
  outputPath: string
  container: string
  videoCodec: string
  audioCodec: string
  audioChannels: string
  audioBitrate: number
  volumeDb: number
  crf: number
  preset: string
  threads: number
  trackSelection: string
  ffmpegPath?: string
  logDirectory?: string
  jobTimestamp?: string
}
