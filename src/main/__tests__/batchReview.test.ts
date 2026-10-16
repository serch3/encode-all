import { mkdtemp, mkdir, rm, writeFile, stat } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { reviewBatchOutputs } from '../batchReview'
import { runBinary } from '../ffmpegSetup'
import type { BatchReviewRequest, EncodingOptions } from '../../preload/api.types'

jest.mock('../ffmpegSetup', () => ({
  runBinary: jest.fn(),
  resolveFfprobePath: async () => 'ffprobe'
}))
let directory: string
let input: string
const settings: EncodingOptions = {
  inputPath: '',
  outputPath: '',
  container: 'mp4',
  videoCodec: 'libx264',
  audioCodec: 'aac',
  audioChannels: 'same',
  audioBitrate: 160,
  volumeDb: 0,
  crf: 23,
  preset: 'medium',
  threads: 0,
  trackSelection: 'auto',
  enableLogging: false,
  twoPass: false,
  subtitleMode: 'none',
  videoBitrate: 2500,
  rateControlMode: 'crf'
}
const requestFor = (
  output: string,
  overrides: Partial<EncodingOptions> = {}
): BatchReviewRequest => ({
  jobs: [
    {
      jobId: 'one',
      name: 'source.mp4',
      encoding: { ...settings, inputPath: input, outputPath: output, ...overrides }
    }
  ],
  sourcePaths: [input],
  supportedNvidiaEncoders: []
})

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'encode-all-review-test-'))
  input = join(directory, 'source.mp4')
  await writeFile(input, 'source')
  ;(runBinary as jest.Mock).mockReset().mockImplementation(async (_bin: string, args: string[]) =>
    args.includes('-encoders')
      ? ' V..... libx264 H.264\n V..... libx265 HEVC\n V..... libvpx-vp9 VP9\n A..... aac AAC\n A..... libopus Opus\n'
      : JSON.stringify({
          streams: [{ index: 0, codec_type: 'video', codec_name: 'h264' }],
          format: { duration: '10' }
        })
  )
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

test('checks a valid batch without creating or modifying output files', async () => {
  const output = join(directory, 'converted.mp4')
  const [entry] = await reviewBatchOutputs(requestFor(output))
  expect(entry.errors).toEqual([])
  expect(entry.outputPath).toBe(output)
  await expect(stat(output)).rejects.toThrow()
  expect(runBinary).toHaveBeenCalledTimes(2)
})

test('returns the exact calculated target-size settings for execution', async () => {
  const [entry] = await reviewBatchOutputs(
    requestFor(join(directory, 'target.mp4'), { targetSizeMb: 1, rateControlMode: 'bitrate' })
  )
  expect(entry.errors).toEqual([])
  expect(entry.encoding.videoBitrate).toBe(776)
  expect(entry.warnings.join()).toContain('approximate')
})

test('plans distinct filenames for existing files and duplicate batch names', async () => {
  const output = join(directory, 'converted.mp4')
  await writeFile(output, 'existing')
  const request = requestFor(output)
  request.jobs.push({ ...request.jobs[0], jobId: 'two' })
  const entries = await reviewBatchOutputs(request)
  expect(entries.map((entry) => entry.outputPath)).toEqual([
    join(directory, 'converted_1.mp4'),
    join(directory, 'converted_2.mp4')
  ])
  expect(entries.every((entry) => entry.warnings.length === 1 && entry.errors.length === 0)).toBe(
    true
  )
  expect(runBinary).toHaveBeenCalledTimes(2)
})

test('protects every queued source, including files outside the selected batch', async () => {
  const other = join(directory, 'other.mp4')
  await writeFile(other, 'other source')
  const request = requestFor(other)
  request.sourcePaths.push(other)
  expect((await reviewBatchOutputs(request))[0].errors.join(' ')).toContain(
    'matches a source video'
  )
})

test.each([
  [{ container: 'webm', videoCodec: 'libx264' }, 'WebM requires'],
  [{ twoPass: true }, 'Two-pass encoding requires'],
  [{ videoCodec: 'h264_nvenc' }, 'NVIDIA encoder is unavailable'],
  [{ crf: 90 }, 'Quality must be'],
  [{ threads: -1 }, 'Threads must be']
] as const)('blocks invalid effective settings %o', async (overrides, message) => {
  const [entry] = await reviewBatchOutputs(requestFor(join(directory, 'out.mp4'), overrides))
  expect(entry.errors.join(' ')).toContain(message)
})

test('catches unavailable software encoders before starting a batch', async () => {
  ;(runBinary as jest.Mock).mockResolvedValue(' A..... aac AAC\n')
  const [entry] = await reviewBatchOutputs(requestFor(join(directory, 'out.mp4')))
  expect(entry.errors.join(' ')).toContain('does not include libx264')
})

test('catches missing sources and invalid output folders', async () => {
  const [entry] = await reviewBatchOutputs(
    requestFor(join(directory, 'missing-folder', 'out.mp4'), {
      inputPath: join(directory, 'missing.mp4')
    })
  )
  expect(entry.errors.join(' ')).toContain('source video is missing')
  expect(entry.errors.join(' ')).toContain('output folder cannot be written')
  const fileDirectory = join(directory, 'not-a-folder')
  await writeFile(fileDirectory, 'file')
  expect(
    (await reviewBatchOutputs(requestFor(join(fileDirectory, 'out.mp4'))))[0].errors.length
  ).toBeGreaterThan(0)
  await mkdir(join(directory, 'valid-folder'))
})
