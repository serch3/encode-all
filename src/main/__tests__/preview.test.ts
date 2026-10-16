import {
  createPreview,
  cancelPreview,
  cleanupPreviews,
  validatePreviewRange,
  openPreviewWindow,
  releasePreview
} from '../preview'
import { BrowserWindow } from 'electron'
import { startEncoding, cancelEncoding } from '../ffmpeg'
import { runBinary } from '../ffmpegSetup'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import type { EncodingOptions } from '../../preload/api.types'

jest.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  net: {},
  shell: {},
  BrowserWindow: jest.fn().mockImplementation(() => {
    let destroyed = false
    let closed: (() => void) | undefined
    return {
      isDestroyed: () => destroyed,
      show: jest.fn(),
      focus: jest.fn(),
      loadURL: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn(() => {
        destroyed = true
        closed?.()
      }),
      on: jest.fn((event, callback) => {
        if (event === 'closed') closed = callback
      }),
      webContents: { on: jest.fn(), setWindowOpenHandler: jest.fn() }
    }
  })
}))
jest.mock('../ffmpeg', () => ({ startEncoding: jest.fn(), cancelEncoding: jest.fn() }))
jest.mock('../ffmpegSetup', () => ({
  runBinary: jest.fn(),
  resolveFfprobePath: async () => '/bin/ffprobe'
}))
jest.mock('fs/promises', () => ({
  mkdtemp: jest.fn(),
  rm: jest.fn(),
  stat: async () => ({ size: 1024 })
}))

const encoding: EncodingOptions = {
  inputPath: '/media/source.mp4',
  outputPath: '/media/batch-output.mp4',
  container: 'mp4',
  videoCodec: 'libx264',
  audioCodec: 'aac',
  audioChannels: 'same',
  audioBitrate: 128,
  volumeDb: 0,
  crf: 23,
  preset: 'medium',
  threads: 0,
  trackSelection: 'auto',
  enableLogging: true,
  twoPass: true,
  subtitleMode: 'none',
  videoBitrate: 1000,
  rateControlMode: 'bitrate'
}

beforeEach(() => {
  ;(runBinary as jest.Mock).mockResolvedValue(
    JSON.stringify({
      streams: [{ index: 0, codec_type: 'video', codec_name: 'h264' }],
      format: { duration: '40' }
    })
  )
  ;(mkdtemp as jest.Mock).mockResolvedValue('/tmp/encode-all-preview-test')
  ;(rm as jest.Mock).mockResolvedValue(undefined)
  ;(startEncoding as jest.Mock).mockImplementation(
    async (options: EncodingOptions) => options.outputPath
  )
})
afterEach(async () => {
  await cleanupPreviews()
})

test.each([
  [0, 31],
  [-1, 10],
  [0, 0],
  [NaN, 10],
  [0, Infinity]
])('rejects invalid preview range (%s, %s) before encoding', (start, duration) => {
  expect(() => validatePreviewRange(start, duration)).toThrow()
})

test('encodes in a temporary directory, preserves two-pass settings, and clamps at source end', async () => {
  const preview = await createPreview(
    { encoding, startSeconds: 35, durationSeconds: 30 },
    {} as never
  )
  expect(startEncoding).toHaveBeenCalledWith(
    expect.objectContaining({
      inputPath: encoding.inputPath,
      outputPath: join('/tmp/encode-all-preview-test', 'preview.mp4'),
      trimStartSeconds: 35,
      trimDurationSeconds: 5,
      twoPass: true,
      enableLogging: false
    }),
    {},
    true
  )
  expect(preview.durationSeconds).toBe(5)
  expect(preview.url).toMatch(/^encode-preview:\/\/clip\/preview-/)
})

test('rejects a start beyond the source length', async () => {
  await expect(
    createPreview({ encoding, startSeconds: 40, durationSeconds: 30 }, {} as never)
  ).rejects.toThrow('beyond the end')
  expect(startEncoding).not.toHaveBeenCalled()
})

test('cleans up a failed sample', async () => {
  ;(startEncoding as jest.Mock).mockResolvedValue(undefined)
  await expect(
    createPreview({ encoding, startSeconds: 0, durationSeconds: 30 }, {} as never)
  ).rejects.toThrow('encoding failed')
  expect(rm).toHaveBeenCalledWith('/tmp/encode-all-preview-test', { recursive: true, force: true })
})

test('cancels only the preview job and waits for process completion before cleanup', async () => {
  let finish!: () => void
  let jobId = ''
  ;(startEncoding as jest.Mock).mockImplementation((options) => {
    jobId = options.jobId
    return new Promise<void>((resolve) => {
      finish = () => resolve()
    })
  })
  const creation = createPreview({ encoding, startSeconds: 0, durationSeconds: 30 }, {} as never)
  const rejected = expect(creation).rejects.toThrow('Preview canceled')
  while (!finish) await Promise.resolve()
  const cancellation = cancelPreview()
  expect(cancelEncoding).toHaveBeenCalledWith(jobId)
  expect(rm).not.toHaveBeenCalled()
  finish()
  await cancellation
  await rejected
  expect(rm).toHaveBeenCalled()
})

test('opens only registered clips in a sandboxed player and reuses its window', async () => {
  const clip = await createPreview({ encoding, startSeconds: 0, durationSeconds: 10 }, {} as never)
  await openPreviewWindow(clip.id, {} as never)
  await openPreviewWindow(clip.id, {} as never)
  expect(BrowserWindow).toHaveBeenCalledTimes(1)
  expect(BrowserWindow).toHaveBeenCalledWith(
    expect.objectContaining({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
  )
  const player = (BrowserWindow as unknown as jest.Mock).mock.results[0].value
  const html = decodeURIComponent(player.loadURL.mock.calls[0][0].split(',')[1])
  expect(html).toContain(clip.url)
  expect(html).toContain("script-src 'none'")
  expect(player.focus).toHaveBeenCalledTimes(1)
  await releasePreview(clip.id)
  expect(player.destroy).toHaveBeenCalled()
})

test('does not open a window for an expired or arbitrary clip', async () => {
  await expect(openPreviewWindow('../source.mp4', {} as never)).rejects.toThrow('expired')
  expect(BrowserWindow).not.toHaveBeenCalled()
})
