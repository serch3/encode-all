import { sourceMediaIssues } from '../../shared/mediaValidation'
import { buildSinglePassFfmpegArgs, buildTwoPassFfmpegArgs } from '../../shared/ffmpegArgs'
import { createProgressParser } from '../ffmpegProgress'
import { bitrateForTargetSize, withTargetSize } from '../../shared/targetSize'
import type { EncodingOptions, MediaInfo } from '../../preload/api.types'

const options: EncodingOptions = {
  inputPath: '/input.mkv',
  outputPath: '/output.mp4',
  container: 'mp4',
  videoCodec: 'libx264',
  audioCodec: 'aac',
  audioChannels: 'same',
  audioBitrate: 160,
  volumeDb: 0,
  crf: 23,
  preset: 'medium',
  threads: 0,
  trackSelection: 'all_audio',
  enableLogging: false,
  twoPass: false,
  subtitleMode: 'copy',
  videoBitrate: 2000,
  rateControlMode: 'crf'
}
const media: MediaInfo = {
  streams: [
    { index: 0, codec_type: 'video', codec_name: 'h264' },
    { index: 1, codec_type: 'audio', codec_name: 'aac' },
    { index: 2, codec_type: 'subtitle', codec_name: 'subrip' }
  ],
  format: { duration: '60' }
}

test('catches incompatible copied source streams before encoding', () => {
  expect(sourceMediaIssues(options, media).errors.join()).toContain('cannot be copied into MP4')
  expect(sourceMediaIssues({ ...options, subtitleMode: 'text' }, media).errors).toEqual([])
  expect(
    sourceMediaIssues(
      { ...options, container: 'webm', videoCodec: 'copy', audioCodec: 'copy' },
      media
    ).errors.join()
  ).toContain('cannot be copied into WebM')
  expect(sourceMediaIssues({ ...options, audioStreamIndex: 2 }, media).errors.join()).toContain(
    'audio stream is not present'
  )
})

test('requires an explicit decision for HDR sources', () => {
  const hdr: MediaInfo = {
    ...media,
    streams: [{ ...media.streams[0], color_transfer: 'smpte2084' }]
  }
  expect(sourceMediaIssues({ ...options, pixelFormat: 'compatible' }, hdr).errors.join()).toContain(
    'HDR'
  )
  expect(sourceMediaIssues({ ...options, pixelFormat: 'preserve' }, hdr).errors).toEqual([])
})

test('builds backend-specific quality arguments and keeps both passes on the same video', () => {
  const args = (videoCodec: string): string[] =>
    buildSinglePassFfmpegArgs({ ...options, videoCodec }, '/out.mp4')
  expect(args('h264_qsv')).toEqual(expect.arrayContaining(['-global_quality', '23']))
  expect(args('h264_amf')).toEqual(
    expect.arrayContaining(['-rc', 'cqp', '-qp_i', '23', '-quality', 'balanced'])
  )
  expect(args('libsvtav1')).toEqual(expect.arrayContaining(['-preset', '7']))
  expect(args('h264_videotoolbox')).not.toContain('-preset')
  const passes = buildTwoPassFfmpegArgs(
    { ...options, rateControlMode: 'bitrate', twoPass: true },
    '/out.mp4',
    '/tmp/stats',
    '/dev/null'
  )
  expect(passes.pass1Args).toEqual(expect.arrayContaining(['-map', '0:v:0?']))
  expect(passes.pass2Args).toEqual(expect.arrayContaining(['-map', '0:v:0?']))
})

test('converts text subtitles, resizes without upscaling, and targets selected stream indices', () => {
  const args = buildSinglePassFfmpegArgs(
    {
      ...options,
      subtitleMode: 'text',
      audioStreamIndex: 1,
      subtitleStreamIndex: 2,
      maxHeight: 1080,
      pixelFormat: 'compatible'
    },
    '/out.mp4'
  )
  expect(args).toEqual(
    expect.arrayContaining([
      '-c:s',
      'mov_text',
      '-map',
      '0:1',
      '-map',
      '0:2',
      '-pix_fmt',
      'yuv420p'
    ])
  )
  expect(args[args.indexOf('-vf') + 1]).toContain('min(ih\\,1080)')
})

test('parses progress records split across chunks and dispatches at record boundaries', () => {
  const received = jest.fn()
  const parse = createProgressParser(received)
  parse('frame=10\nfps=2.0\nout_time_')
  parse('us=5000000\ntotal_size=2048\nspeed=1.2x\nprogress=cont')
  expect(received).not.toHaveBeenCalled()
  parse('inue\n')
  expect(received).toHaveBeenCalledWith(
    expect.objectContaining({ seconds: 5, fps: '2.0', size: '2KiB', speed: '1.2x' })
  )
})

test('calculates per-file target bitrate after reserving audio and container overhead', () => {
  expect(bitrateForTargetSize(100, 600, 160)).toBe(1133)
  expect(bitrateForTargetSize(100, 300, 160)).toBeGreaterThan(bitrateForTargetSize(100, 600, 160))
  expect(() => bitrateForTargetSize(1, 3600, 160)).toThrow('too small')
  expect(() => bitrateForTargetSize(100, 0, 160)).toThrow('known source duration')
})

test('target size reserves only the audio streams that will be written', () => {
  const multiAudio: MediaInfo = {
    streams: [
      ...media.streams,
      { index: 3, codec_type: 'audio', codec_name: 'aac', bit_rate: '320000' }
    ],
    format: { duration: '600' }
  }
  const base = { ...options, targetSizeMb: 100, rateControlMode: 'bitrate' }
  expect(withTargetSize(base, multiAudio).videoBitrate).toBe(973)
  expect(withTargetSize({ ...base, audioStreamIndex: 3 }, multiAudio).videoBitrate).toBe(1133)
  const mapped = buildSinglePassFfmpegArgs({ ...base, subtitleStreamIndex: 2 }, '/output.mp4')
  expect(mapped).toContain('0:a?')
})
