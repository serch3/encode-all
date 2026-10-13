import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'
const directory = await mkdtemp(join(tmpdir(), 'encode-all-integration-'))

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function run(executable, args) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true
  })
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr.slice(-5000))
  return result.stdout
}

try {
  const source = await readFile(new URL('../src/shared/ffmpegArgs.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const modulePath = join(directory, 'args.cjs')
  await writeFile(modulePath, compiled)
  const { buildSinglePassFfmpegArgs, buildTwoPassFfmpegArgs } = createRequire(import.meta.url)(
    modulePath
  )
  const inputPath = join(directory, 'source clip 日本語 é & sample.mkv')
  run(ffmpeg, [
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=160x90:rate=10',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '35',
    '-c:v',
    'ffv1',
    '-c:a',
    'pcm_s16le',
    inputPath
  ])
  const base = {
    inputPath,
    outputPath: '',
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    audioChannels: 'stereo',
    audioBitrate: 128,
    volumeDb: 0,
    crf: 23,
    preset: 'ultrafast',
    threads: 2,
    trackSelection: 'auto',
    enableLogging: false,
    twoPass: false,
    subtitleMode: 'none',
    videoBitrate: 300,
    rateControlMode: 'crf',
    trimStartSeconds: 3,
    trimDurationSeconds: 30
  }
  const cases = [
    ['h264-preview', base],
    [
      'h265-two-pass',
      {
        ...base,
        videoCodec: 'libx265',
        twoPass: true,
        rateControlMode: 'bitrate',
        trimDurationSeconds: 2
      }
    ],
    [
      'vp9-two-pass',
      {
        ...base,
        container: 'webm',
        videoCodec: 'libvpx-vp9',
        audioCodec: 'libopus',
        twoPass: true,
        rateControlMode: 'bitrate',
        trimDurationSeconds: 2
      }
    ]
  ]
  for (const [name, options] of cases) {
    const outputPath = join(directory, `${name}.${options.container}`)
    if (options.twoPass) {
      // A colon exercises the same escaping needed for Windows drive letters.
      const prefix = join(
        directory,
        process.platform === 'win32'
          ? 'pass stats 日本語 & clips'
          : 'colon:pass stats 日本語 & clips',
        name
      )
      await mkdir(dirname(prefix), { recursive: true })
      const { pass1Args, pass2Args } = buildTwoPassFfmpegArgs(
        options,
        outputPath,
        prefix,
        process.platform === 'win32' ? 'NUL' : '/dev/null'
      )
      run(ffmpeg, pass1Args)
      run(ffmpeg, pass2Args)
    } else {
      run(ffmpeg, buildSinglePassFfmpegArgs(options, outputPath))
    }
    const metadata = JSON.parse(
      run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', outputPath])
    )
    const duration = Number(metadata.format.duration)
    // One frame's muxer rounding is allowed at 10 fps.
    if (!Number.isFinite(duration) || duration <= 0 || duration > options.trimDurationSeconds + 0.1)
      throw new Error(`${name}: unexpected clip duration ${duration}`)
    if (!metadata.streams.some((stream) => stream.codec_type === 'audio'))
      throw new Error(`${name}: audio is missing`)
    console.log(`${name}: ${duration}s, ${metadata.format.size} bytes, audio present`)
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
