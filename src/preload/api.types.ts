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
  startEncoding: (options: EncodingOptions & { jobId?: string }) => Promise<void>
  cancelEncoding: (jobId?: string) => Promise<void>
  onEncodingProgress: (callback: (payload: EncodingProgressPayload) => void) => () => void
  onEncodingLog: (callback: (payload: EncodingLogPayload) => void) => () => void
  onEncodingComplete: (callback: (payload: EncodingCompletePayload) => void) => () => void
  onEncodingError: (callback: (payload: EncodingErrorPayload) => void) => () => void
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
  twoPass: boolean
  subtitleMode: string
  videoBitrate: number
  rateControlMode: 'crf' | 'bitrate'
}

export interface EncodingProgressPayload {
  jobId: string
  progress: number
}

export interface EncodingLogPayload {
  jobId: string
  log: string
}

export interface EncodingCompletePayload {
  jobId: string
  outputPath?: string
}

export interface EncodingErrorPayload {
  jobId: string
  error: string
}
