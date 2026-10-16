export interface MediaStream {
  index: number
  codec_type: 'video' | 'audio' | 'subtitle' | 'data' | string
  codec_name: string
  profile?: string
  width?: number
  height?: number
  r_frame_rate?: string
  pix_fmt?: string
  color_transfer?: string
  color_primaries?: string
  channels?: number
  channel_layout?: string
  sample_rate?: string
  bit_rate?: string
  tags?: Record<string, string>
}

export interface MediaInfo {
  streams: MediaStream[]
  format: {
    duration?: string
    bit_rate?: string
    size?: string
    format_name?: string
  }
}

export interface CustomAPI {
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: (channel: 'stable' | 'beta') => Promise<UpdateState>
  downloadUpdate: () => Promise<UpdateState>
  installUpdate: () => Promise<void>
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
  onNativeImport: (callback: (paths: string[]) => void) => () => void
  loadQueueState: () => Promise<unknown>
  saveQueueState: (jobs: unknown[]) => Promise<void>
  getEncodingHistory: () => Promise<EncodingHistoryEntry[]>
  clearEncodingHistory: () => Promise<void>
  openOutput: (id: string, reveal?: boolean) => Promise<void>
  setBatchProgress: (progress: number) => Promise<void>
  notifyBatchComplete: (successful: number, failed: number) => Promise<void>
  selectVideoFiles: () => Promise<VideoFileInfo[]>
  importPaths: (paths: string[]) => Promise<VideoFileInfo[]>
  getPathForFile: (file: File) => string
  getFfmpegInstaller: () => Promise<FfmpegInstaller>
  installFfmpeg: () => Promise<FfmpegStatus>
  onFfmpegInstallLog: (callback: (log: string) => void) => () => void
  createPreview: (options: PreviewOptions) => Promise<PreviewResult>
  cancelPreview: () => Promise<void>
  releasePreview: (id: string) => Promise<void>
  openPreview: (id: string) => Promise<void>
  openPreviewWindow: (id: string) => Promise<void>
  reviewBatchOutputs: (request: BatchReviewRequest) => Promise<BatchReviewEntry[]>
  selectFolder: () => Promise<string | null>
  readVideoFiles: (folderPath: string) => Promise<
    Array<{
      name: string
      path: string
      size: number
      modified: number
    }>
  >
  checkFfmpeg: (ffmpegPath?: string) => Promise<{
    isInstalled: boolean
    version?: string
    path?: string
    error?: string
  }>
  checkNvidiaSupport: (ffmpegPath?: string) => Promise<boolean>
  getSupportedNvidiaEncoders: (ffmpegPath?: string) => Promise<string[]>
  getSupportedEncoders: (ffmpegPath?: string, refresh?: boolean) => Promise<string[]>
  selectFfmpegPath: () => Promise<string | null>
  openExternal: (url: string) => Promise<void>
  startEncoding: (options: EncodingOptions & { jobId?: string }) => Promise<void>
  cancelEncoding: (jobId?: string) => Promise<void>
  onEncodingProgress: (callback: (payload: EncodingProgressPayload) => void) => () => void
  onEncodingLog: (callback: (payload: EncodingLogPayload) => void) => () => void
  onEncodingComplete: (callback: (payload: EncodingCompletePayload) => void) => () => void
  onEncodingError: (callback: (payload: EncodingErrorPayload) => void) => () => void
  pathJoin: (...paths: string[]) => Promise<string>
  saveTextFile: (content: string, defaultName?: string) => Promise<boolean>
  readTextFile: () => Promise<string | null>
  probeFile: (filePath: string, ffmpegPath?: string) => Promise<MediaInfo>
}

export interface FfmpegStatus {
  isInstalled: boolean
  version?: string
  path?: string
  ffprobePath?: string
  error?: string
}

export interface FfmpegInstaller {
  available: boolean
  manager: 'winget' | 'brew' | null
  command?: string
  reason?: string
}

export interface PreviewOptions {
  encoding: EncodingOptions
  startSeconds: number
  durationSeconds: number
}

export interface PreviewResult {
  id: string
  url: string
  size: number
  durationSeconds: number
  sourceUrl?: string
  sourceStartSeconds?: number
}

export interface BatchReviewRequest {
  jobs: Array<{ jobId: string; name: string; encoding: EncodingOptions }>
  sourcePaths: string[]
  supportedNvidiaEncoders?: string[]
}

export interface BatchReviewEntry {
  reviewToken?: string
  jobId: string
  name: string
  inputPath: string
  outputPath: string
  encoding: EncodingOptions
  errors: string[]
  warnings: string[]
}

export interface EncodingOptions {
  reviewToken?: string
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
  enableLogging: boolean
  logDirectory?: string
  jobTimestamp?: string
  twoPass: boolean
  subtitleMode: string
  videoBitrate: number
  rateControlMode: 'crf' | 'bitrate'
  /** Used only for bounded sample encodes. */
  trimStartSeconds?: number
  trimDurationSeconds?: number
  sourceDurationSeconds?: number
  /** Explicit format policy for compatible SDR playback or source preservation. */
  pixelFormat?: 'compatible' | 'preserve'
  maxHeight?: number
  targetSizeMb?: number
  audioStreamIndex?: number
  subtitleStreamIndex?: number
}

export interface VideoFileInfo {
  name: string
  path: string
  size: number
  modified: number
}

export interface UpdateState {
  status:
    | 'unavailable'
    | 'idle'
    | 'checking'
    | 'current'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'error'
  version?: string
  progress?: number
  message?: string
}

export interface EncodingHistoryEntry {
  id: string
  inputPath: string
  outputPath: string
  inputSize: number
  outputSize: number
  startedAt: number
  completedAt: number
  videoCodec: string
  container: string
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
  outputSize?: number
  elapsedMs?: number
}

export interface EncodingErrorPayload {
  jobId: string
  error: string
}
