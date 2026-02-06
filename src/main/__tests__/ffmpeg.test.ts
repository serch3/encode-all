import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'
import { cancelEncoding, startEncoding } from '../ffmpeg'
import type { EncodingOptions } from '../../preload/api.types'

const spawnMock = jest.fn()
const createWriteStreamMock = jest.fn()
const existsSyncMock = jest.fn(() => true)
const mkdirSyncMock = jest.fn()
const powerSaveBlockerStartMock = jest.fn(() => 1)
const powerSaveBlockerStopMock = jest.fn()

jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args)
}))

jest.mock('fs', () => ({
  createWriteStream: (...args: unknown[]) => createWriteStreamMock(...args),
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
  mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args)
}))

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  powerSaveBlocker: {
    start: (...args: unknown[]) => powerSaveBlockerStartMock(...args),
    stop: (...args: unknown[]) => powerSaveBlockerStopMock(...args)
  }
}))

const createMockProcess = (onKillExitCode: number | null = null): ChildProcess => {
  const emitter = new EventEmitter()
  const stderr = new EventEmitter()

  const proc = emitter as unknown as ChildProcess & {
    stderr: EventEmitter
    kill: jest.Mock
  }

  proc.stderr = stderr
  proc.kill = jest.fn(() => {
    if (onKillExitCode !== null) {
      process.nextTick(() => emitter.emit('close', onKillExitCode))
    }
  })

  return proc
}

const createMainWindowMock = () => ({
  webContents: {
    send: jest.fn()
  },
  setProgressBar: jest.fn()
})

const createBaseOptions = (): EncodingOptions => ({
  inputPath: 'C:/videos/input.mp4',
  outputPath: 'C:/videos/output.mkv',
  videoCodec: 'libx265',
  audioCodec: 'aac',
  audioChannels: 'stereo',
  audioBitrate: 128,
  volumeDb: -2,
  crf: 23,
  preset: 'medium',
  threads: 2,
  trackSelection: 'all_audio',
  ffmpegPath: 'ffmpeg',
  logDirectory: 'C:/logs',
  jobTimestamp: undefined,
  twoPass: false,
  subtitleMode: 'copy',
  videoBitrate: 2500,
  rateControlMode: 'crf'
})

const createLogStream = () => ({
  write: jest.fn(),
  end: jest.fn()
})

beforeEach(() => {
  spawnMock.mockReset()
  createWriteStreamMock.mockReset()
  existsSyncMock.mockReset()
  mkdirSyncMock.mockReset()
  powerSaveBlockerStartMock.mockReset()
  powerSaveBlockerStopMock.mockReset()
})

describe('startEncoding', () => {
  test('builds single-pass args with audio, subtitles, and mapping', async () => {
    const proc = createMockProcess()
    spawnMock.mockImplementation((exe: string, args: string[]) => {
      process.nextTick(() => proc.emit('close', 0))
      return proc
    })
    createWriteStreamMock.mockReturnValue(createLogStream())

    const mainWindow = createMainWindowMock()
    const options = createBaseOptions()

    await startEncoding(options, mainWindow as never)

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [executable, args] = spawnMock.mock.calls[0]
    expect(executable).toBe('ffmpeg')

    expect(args).toEqual([
      '-y',
      '-i',
      options.inputPath,
      '-map_metadata',
      '0',
      '-c:v',
      options.videoCodec,
      '-crf',
      options.crf.toString(),
      '-preset',
      options.preset,
      '-c:a',
      options.audioCodec,
      '-b:a',
      `${options.audioBitrate}k`,
      '-ac',
      '2',
      '-filter:a',
      `volume=${options.volumeDb}dB`,
      '-c:s',
      'copy',
      '-threads',
      options.threads.toString(),
      '-map',
      '0:v:0',
      '-map',
      '0:a',
      '-map',
      '0:s?',
      options.outputPath
    ])

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('encoding-complete', {
      jobId: expect.any(String),
      outputPath: options.outputPath
    })
  })

  test('runs two-pass encoding with bitrate mode', async () => {
    const proc1 = createMockProcess()
    const proc2 = createMockProcess()

    spawnMock
      .mockImplementationOnce(() => {
        process.nextTick(() => proc1.emit('close', 0))
        return proc1
      })
      .mockImplementationOnce(() => {
        process.nextTick(() => proc2.emit('close', 0))
        return proc2
      })

    createWriteStreamMock.mockReturnValue(createLogStream())

    const mainWindow = createMainWindowMock()
    const options = {
      ...createBaseOptions(),
      videoCodec: 'libx264',
      rateControlMode: 'bitrate',
      twoPass: true,
      subtitleMode: 'none',
      trackSelection: 'auto',
      audioCodec: 'copy',
      audioChannels: 'same',
      audioBitrate: 0,
      volumeDb: 0
    } satisfies EncodingOptions

    await startEncoding(options, mainWindow as never)

    expect(spawnMock).toHaveBeenCalledTimes(2)

    const firstArgs = spawnMock.mock.calls[0][1] as string[]
    expect(firstArgs).toEqual(
      expect.arrayContaining([
        '-c:v',
        options.videoCodec,
        '-b:v',
        `${options.videoBitrate}k`,
        '-preset',
        options.preset,
        '-an',
        '-sn',
        '-pass',
        '1',
        '-f',
        'null',
        'NUL'
      ])
    )

    const secondArgs = spawnMock.mock.calls[1][1] as string[]
    expect(secondArgs).toEqual(
      expect.arrayContaining([
        '-c:v',
        options.videoCodec,
        '-b:v',
        `${options.videoBitrate}k`,
        '-preset',
        options.preset,
        '-pass',
        '2',
        options.outputPath
      ])
    )

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('encoding-complete', {
      jobId: expect.any(String),
      outputPath: options.outputPath
    })
  })

  test('cancelEncoding kills active job and closes log stream', async () => {
    const proc = createMockProcess(1)
    spawnMock.mockImplementation(() => proc)
    const logStream = createLogStream()
    createWriteStreamMock.mockReturnValue(logStream)

    const mainWindow = createMainWindowMock()
    const options = {
      ...createBaseOptions(),
      jobId: 'job-cancel-test'
    }

    const startPromise = startEncoding(options, mainWindow as never)

    cancelEncoding(options.jobId)

    await startPromise

    expect(proc.kill).toHaveBeenCalled()
    expect(logStream.end).toHaveBeenCalled()
    expect(powerSaveBlockerStopMock).toHaveBeenCalled()
  })
})
