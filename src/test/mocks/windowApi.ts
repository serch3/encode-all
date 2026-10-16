import type {
  CustomAPI,
  EncodingCompletePayload,
  EncodingErrorPayload,
  EncodingLogPayload,
  MediaInfo,
  EncodingOptions,
  EncodingProgressPayload,
  FfmpegInstaller,
  FfmpegStatus,
  PreviewOptions,
  PreviewResult,
  BatchReviewRequest,
  BatchReviewEntry,
  EncodingHistoryEntry,
  VideoFileInfo,
  UpdateState
} from '../../preload/api.types'

export type WindowApiMock = {
  getUpdateState: jest.Mock<Promise<UpdateState>, []>
  checkForUpdates: jest.Mock<Promise<UpdateState>, ['stable' | 'beta']>
  downloadUpdate: jest.Mock<Promise<UpdateState>, []>
  installUpdate: jest.Mock<Promise<void>, []>
  onUpdateState: jest.Mock<() => void, [(state: UpdateState) => void]>
  onNativeImport: jest.Mock<() => void, [(paths: string[]) => void]>
  loadQueueState: jest.Mock<Promise<unknown>, []>
  saveQueueState: jest.Mock<Promise<void>, [unknown[]]>
  getEncodingHistory: jest.Mock<Promise<EncodingHistoryEntry[]>, []>
  clearEncodingHistory: jest.Mock<Promise<void>, []>
  openOutput: jest.Mock<Promise<void>, [string, boolean?]>
  setBatchProgress: jest.Mock<Promise<void>, [number]>
  notifyBatchComplete: jest.Mock<Promise<void>, [number, number]>
  selectVideoFiles: jest.Mock<Promise<VideoFileInfo[]>, []>
  importPaths: jest.Mock<Promise<VideoFileInfo[]>, [string[]]>
  getPathForFile: jest.Mock<string, [File]>
  getFfmpegInstaller: jest.Mock<Promise<FfmpegInstaller>, []>
  installFfmpeg: jest.Mock<Promise<FfmpegStatus>, []>
  onFfmpegInstallLog: jest.Mock<() => void, [(log: string) => void]>
  createPreview: jest.Mock<Promise<PreviewResult>, [PreviewOptions]>
  cancelPreview: jest.Mock<Promise<void>, []>
  releasePreview: jest.Mock<Promise<void>, [string]>
  openPreview: jest.Mock<Promise<void>, [string]>
  openPreviewWindow: jest.Mock<Promise<void>, [string]>
  reviewBatchOutputs: jest.Mock<Promise<BatchReviewEntry[]>, [BatchReviewRequest]>
  selectFolder: jest.Mock<Promise<string | null>, []>
  readVideoFiles: jest.Mock<
    Promise<
      Array<{
        name: string
        path: string
        size: number
        modified: number
      }>
    >,
    [string]
  >
  checkFfmpeg: jest.Mock<
    Promise<{
      isInstalled: boolean
      version?: string
      path?: string
      error?: string
    }>,
    [string?]
  >
  selectFfmpegPath: jest.Mock<Promise<string | null>, []>
  openExternal: jest.Mock<Promise<void>, [string]>
  checkNvidiaSupport: jest.Mock<Promise<boolean>, [string?]>
  getSupportedNvidiaEncoders: jest.Mock<Promise<string[]>, [string?]>
  getSupportedEncoders: jest.Mock<Promise<string[]>, [string?, boolean?]>
  onEncodingProgress: jest.Mock<() => void, [(payload: EncodingProgressPayload) => void]>
  onEncodingLog: jest.Mock<() => void, [(payload: EncodingLogPayload) => void]>
  onEncodingComplete: jest.Mock<() => void, [(payload: EncodingCompletePayload) => void]>
  onEncodingError: jest.Mock<() => void, [(payload: EncodingErrorPayload) => void]>
  startEncoding: jest.Mock<Promise<void>, [EncodingOptions & { jobId?: string }]>
  cancelEncoding: jest.Mock<Promise<void>, [string?]>
  pathJoin: jest.Mock<Promise<string>, string[]>
  saveTextFile: jest.Mock<Promise<boolean>, [string, string?]>
  readTextFile: jest.Mock<Promise<string | null>, []>
  probeFile: jest.Mock<Promise<MediaInfo>, [string, string?]>
}

const ensureWindowApi = (): CustomAPI => {
  const globalWindow = window as Window & { api?: CustomAPI }

  if (!globalWindow.api) {
    Object.defineProperty(globalWindow, 'api', {
      configurable: true,
      writable: true,
      value: {} as CustomAPI
    })
  }

  return globalWindow.api as CustomAPI
}

const defaultWindowApiMock = (): WindowApiMock => ({
  getUpdateState: jest.fn().mockResolvedValue({ status: 'unavailable' }),
  checkForUpdates: jest.fn().mockResolvedValue({ status: 'current' }),
  downloadUpdate: jest.fn().mockResolvedValue({ status: 'downloaded' }),
  installUpdate: jest.fn().mockResolvedValue(undefined),
  onUpdateState: jest.fn().mockReturnValue(() => {}),
  onNativeImport: jest.fn().mockReturnValue(() => {}),
  loadQueueState: jest.fn().mockResolvedValue(null),
  saveQueueState: jest.fn().mockResolvedValue(undefined),
  getEncodingHistory: jest.fn().mockResolvedValue([]),
  clearEncodingHistory: jest.fn().mockResolvedValue(undefined),
  openOutput: jest.fn().mockResolvedValue(undefined),
  setBatchProgress: jest.fn().mockResolvedValue(undefined),
  notifyBatchComplete: jest.fn().mockResolvedValue(undefined),
  selectVideoFiles: jest.fn().mockResolvedValue([]),
  importPaths: jest.fn().mockResolvedValue([]),
  getPathForFile: jest.fn().mockReturnValue('/videos/dropped.mp4'),
  getFfmpegInstaller: jest.fn().mockResolvedValue({ available: false, manager: null }),
  installFfmpeg: jest.fn().mockResolvedValue({ isInstalled: false }),
  onFfmpegInstallLog: jest.fn().mockReturnValue(() => {}),
  createPreview: jest.fn().mockResolvedValue({
    id: 'preview-test',
    url: 'encode-preview://clip/preview-test',
    size: 1024,
    durationSeconds: 30
  }),
  cancelPreview: jest.fn().mockResolvedValue(undefined),
  releasePreview: jest.fn().mockResolvedValue(undefined),
  openPreview: jest.fn().mockResolvedValue(undefined),
  openPreviewWindow: jest.fn().mockResolvedValue(undefined),
  reviewBatchOutputs: jest.fn().mockImplementation(async (request: BatchReviewRequest) =>
    request.jobs.map((job) => ({
      jobId: job.jobId,
      name: job.name,
      inputPath: job.encoding.inputPath,
      outputPath: job.encoding.outputPath,
      encoding: job.encoding,
      errors: [],
      warnings: []
    }))
  ),
  selectFolder: jest.fn().mockResolvedValue(null),
  readVideoFiles: jest.fn().mockResolvedValue([]),
  checkFfmpeg: jest.fn().mockResolvedValue({ isInstalled: false }),
  selectFfmpegPath: jest.fn().mockResolvedValue(null),
  openExternal: jest.fn().mockResolvedValue(undefined),
  checkNvidiaSupport: jest.fn().mockResolvedValue(false),
  getSupportedNvidiaEncoders: jest.fn().mockResolvedValue([]),
  getSupportedEncoders: jest.fn().mockResolvedValue(['libx264', 'libx265', 'libvpx-vp9', 'copy']),
  onEncodingProgress: jest.fn().mockReturnValue(() => {}),
  onEncodingLog: jest.fn().mockReturnValue(() => {}),
  onEncodingComplete: jest.fn().mockReturnValue(() => {}),
  onEncodingError: jest.fn().mockReturnValue(() => {}),
  startEncoding: jest.fn().mockResolvedValue(undefined),
  cancelEncoding: jest.fn().mockResolvedValue(undefined),
  pathJoin: jest.fn().mockImplementation(async (...parts: string[]) => parts.join('/')),
  saveTextFile: jest.fn().mockResolvedValue(true),
  readTextFile: jest.fn().mockResolvedValue(null),
  probeFile: jest.fn().mockResolvedValue({ streams: [], format: {} })
})

const applyMockToWindow = (mock: WindowApiMock): WindowApiMock => {
  const target = ensureWindowApi() as unknown as CustomAPI & WindowApiMock
  Object.assign(target, mock)
  return mock
}

let activeMock: WindowApiMock | undefined

export const getWindowApiMock = (): WindowApiMock => {
  if (!activeMock) {
    activeMock = applyMockToWindow(defaultWindowApiMock())
  }
  return activeMock
}

export const mockWindowApi = (configure?: (mock: WindowApiMock) => void): WindowApiMock => {
  const mock = defaultWindowApiMock()
  if (configure) {
    configure(mock)
  }
  activeMock = applyMockToWindow(mock)
  return activeMock
}

export const resetWindowApiMock = (): WindowApiMock => {
  activeMock = undefined
  return mockWindowApi()
}
