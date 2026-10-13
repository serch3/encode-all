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
  PreviewResult
} from '../../preload/api.types'

export type WindowApiMock = {
  getPathForFile: jest.Mock<string, [File]>
  getFfmpegInstaller: jest.Mock<Promise<FfmpegInstaller>, []>
  installFfmpeg: jest.Mock<Promise<FfmpegStatus>, []>
  onFfmpegInstallLog: jest.Mock<() => void, [(log: string) => void]>
  createPreview: jest.Mock<Promise<PreviewResult>, [PreviewOptions]>
  cancelPreview: jest.Mock<Promise<void>, []>
  releasePreview: jest.Mock<Promise<void>, [string]>
  openPreview: jest.Mock<Promise<void>, [string]>
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
  selectFolder: jest.fn().mockResolvedValue(null),
  readVideoFiles: jest.fn().mockResolvedValue([]),
  checkFfmpeg: jest.fn().mockResolvedValue({ isInstalled: false }),
  selectFfmpegPath: jest.fn().mockResolvedValue(null),
  openExternal: jest.fn().mockResolvedValue(undefined),
  checkNvidiaSupport: jest.fn().mockResolvedValue(false),
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
