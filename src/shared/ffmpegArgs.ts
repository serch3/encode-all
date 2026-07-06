import type { EncodingOptions } from '../preload/api.types'

export interface FfmpegArgParts {
  baseArgs: string[]
  videoArgs: string[]
  audioArgs: string[]
  subtitleArgs: string[]
  commonArgs: string[]
  mapArgs: string[]
}

export function canUseTwoPass(
  options: Pick<EncodingOptions, 'twoPass' | 'videoCodec' | 'rateControlMode'>
): boolean {
  const supportsFfmpegPass = ['libx264', 'libx265', 'libvpx-vp9'].includes(options.videoCodec)
  return options.twoPass && supportsFfmpegPass && options.rateControlMode === 'bitrate'
}

export function buildFfmpegArgParts(options: EncodingOptions): FfmpegArgParts {
  const {
    inputPath,
    videoCodec,
    audioCodec,
    audioChannels,
    audioBitrate,
    volumeDb,
    crf,
    preset,
    threads,
    trackSelection,
    subtitleMode,
    videoBitrate,
    rateControlMode
  } = options

  const baseArgs = ['-hide_banner', '-nostdin', '-i', inputPath, '-map_metadata', '0']

  const videoArgs = ['-c:v', videoCodec]
  if (videoCodec !== 'copy') {
    if (rateControlMode === 'bitrate') {
      videoArgs.push('-b:v', `${videoBitrate}k`)
    } else if (videoCodec === 'libvpx-vp9') {
      videoArgs.push('-b:v', '0', '-crf', crf.toString())
    } else if (videoCodec.includes('nvenc')) {
      videoArgs.push('-rc', 'vbr', '-cq', crf.toString(), '-b:v', '0')
    } else {
      videoArgs.push('-crf', crf.toString())
    }
    videoArgs.push(...presetArgsFor(videoCodec, preset))
  }

  const audioArgs = ['-c:a', audioCodec]
  if (audioCodec !== 'copy') {
    if (audioBitrate > 0) {
      audioArgs.push('-b:a', `${audioBitrate}k`)
    }
    if (audioChannels !== 'same') {
      const channels = channelCountFor(audioChannels)
      if (channels) {
        audioArgs.push('-ac', channels)
      }
    }
    if (volumeDb !== 0) {
      audioArgs.push('-filter:a', `volume=${volumeDb}dB`)
    }
  }

  const subtitleArgs: string[] = []
  if (subtitleMode === 'none') {
    subtitleArgs.push('-sn')
  } else if (subtitleMode === 'copy') {
    subtitleArgs.push('-c:s', 'copy')
  }

  const commonArgs: string[] = []
  if (threads > 0) {
    commonArgs.push('-threads', threads.toString())
  }

  return {
    baseArgs,
    videoArgs,
    audioArgs,
    subtitleArgs,
    commonArgs,
    mapArgs: buildMapArgs(trackSelection, subtitleMode)
  }
}

export function buildSinglePassFfmpegArgs(options: EncodingOptions, outputPath: string): string[] {
  const { baseArgs, videoArgs, audioArgs, subtitleArgs, commonArgs, mapArgs } =
    buildFfmpegArgParts(options)

  return [
    ...baseArgs,
    ...videoArgs,
    ...audioArgs,
    ...subtitleArgs,
    ...commonArgs,
    ...mapArgs,
    ...finalOutputArgs(options, outputPath)
  ]
}

export function buildTwoPassFfmpegArgs(
  options: EncodingOptions,
  outputPath: string,
  passLogPrefix: string,
  nullOutputPath: string
): { pass1Args: string[]; pass2Args: string[] } {
  if (options.rateControlMode !== 'bitrate') {
    throw new Error('Two-pass encoding requires average bitrate mode')
  }

  const { baseArgs, videoArgs, audioArgs, subtitleArgs, commonArgs, mapArgs } =
    buildFfmpegArgParts(options)

  return {
    pass1Args: [
      ...baseArgs,
      ...videoArgs,
      '-an',
      '-sn',
      ...commonArgs,
      '-pass',
      '1',
      '-passlogfile',
      passLogPrefix,
      '-f',
      'null',
      nullOutputPath
    ],
    pass2Args: [
      ...baseArgs,
      ...videoArgs,
      ...audioArgs,
      ...subtitleArgs,
      ...commonArgs,
      ...mapArgs,
      '-pass',
      '2',
      '-passlogfile',
      passLogPrefix,
      ...finalOutputArgs(options, outputPath)
    ]
  }
}

function finalOutputArgs(options: EncodingOptions, outputPath: string): string[] {
  const args = ['-n']
  const container = options.container.toLowerCase()
  if (container === 'mp4' || container === 'mov' || container === 'm4v') {
    args.push('-movflags', '+faststart')
  }
  args.push(outputPath)
  return args
}

function presetArgsFor(videoCodec: string, preset: string): string[] {
  if (videoCodec === 'libvpx-vp9') {
    return ['-deadline', 'good', '-cpu-used', vp9CpuUsedFor(preset)]
  }

  return ['-preset', preset]
}

function vp9CpuUsedFor(preset: string): string {
  switch (preset) {
    case 'ultrafast':
      return '8'
    case 'superfast':
      return '7'
    case 'veryfast':
      return '6'
    case 'faster':
      return '5'
    case 'fast':
      return '4'
    case 'slow':
      return '2'
    case 'slower':
      return '1'
    case 'veryslow':
      return '0'
    case 'medium':
    default:
      return '3'
  }
}

function buildMapArgs(trackSelection: string, subtitleMode: string): string[] {
  if (trackSelection === 'all') {
    const args = ['-map', '0:v?', '-map', '0:a?']
    if (subtitleMode === 'copy') {
      args.push('-map', '0:s?')
    }
    return args
  }

  if (trackSelection === 'all_audio') {
    const args = ['-map', '0:v:0?', '-map', '0:a?']
    if (subtitleMode === 'copy') {
      args.push('-map', '0:s?')
    }
    return args
  }

  if (subtitleMode === 'copy') {
    return ['-map', '0:v:0?', '-map', '0:a:0?', '-map', '0:s?']
  }

  return []
}

function channelCountFor(audioChannels: string): string | null {
  if (audioChannels === 'mono') return '1'
  if (audioChannels === 'stereo') return '2'
  if (audioChannels === '5.1') return '6'
  return null
}
