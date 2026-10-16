import type { EncodingOptions, MediaInfo } from '../preload/api.types'

export function sourceMediaIssues(
  options: EncodingOptions,
  media: MediaInfo
): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const { videos, audios, subtitles } = selectedMediaStreams(options, media)
  if (!videos.length) errors.push('No video stream was found in the source file.')
  for (const [index, type] of [
    [options.audioStreamIndex, 'audio'],
    [options.subtitleStreamIndex, 'subtitle']
  ] as const) {
    if (
      index !== undefined &&
      !media.streams.some((stream) => stream.index === index && stream.codec_type === type)
    )
      errors.push(`The selected ${type} stream is not present in this source.`)
  }
  if (options.container === 'webm') {
    if (
      options.videoCodec === 'copy' &&
      videos.some((stream) => !['vp8', 'vp9', 'av1'].includes(stream.codec_name))
    )
      errors.push('The source video cannot be copied into WebM. Choose VP9 or AV1 encoding.')
    if (
      options.audioCodec === 'copy' &&
      audios.some((stream) => !['opus', 'vorbis'].includes(stream.codec_name))
    )
      errors.push('The source audio cannot be copied into WebM. Choose Opus encoding.')
  }
  if (options.subtitleMode === 'copy' && subtitles.length) {
    if (
      ['mp4', 'mov'].includes(options.container) &&
      subtitles.some((stream) => stream.codec_name !== 'mov_text')
    )
      errors.push(
        'These subtitles cannot be copied into MP4/MOV. Convert text subtitles, remove them, or choose MKV.'
      )
    if (options.container === 'webm' && subtitles.some((stream) => stream.codec_name !== 'webvtt'))
      errors.push(
        'WebM needs WebVTT subtitles. Convert text subtitles, remove them, or choose MKV.'
      )
  }
  if (
    options.subtitleMode === 'text' &&
    subtitles.some(
      (stream) =>
        !['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text'].includes(stream.codec_name)
    )
  )
    errors.push('Bitmap subtitles cannot be converted to text. Remove them or use MKV passthrough.')
  if (
    options.videoCodec !== 'copy' &&
    options.pixelFormat === 'compatible' &&
    videos.some((stream) => ['smpte2084', 'arib-std-b67'].includes(stream.color_transfer ?? ''))
  )
    errors.push(
      'This source is HDR. Choose Preserve source format to keep HDR; compatible SDR output requires tone mapping.'
    )
  if (options.videoCodec === 'copy' && options.pixelFormat === 'compatible')
    warnings.push(
      'Stream copy keeps the source pixel format and color information; the compatibility setting does not convert it.'
    )
  if (options.trackSelection === 'all' && videos.length > 1 && options.twoPass)
    errors.push('Two-pass encoding supports one video stream. Choose Auto or All audio tracks.')
  return { errors, warnings }
}

export function selectedMediaStreams(
  options: EncodingOptions,
  media: MediaInfo
): { videos: MediaInfo['streams']; audios: MediaInfo['streams']; subtitles: MediaInfo['streams'] } {
  const sourceVideos = media.streams.filter((stream) => stream.codec_type === 'video')
  const explicitMapping =
    options.trackSelection !== 'auto' ||
    options.subtitleMode !== 'none' ||
    options.audioStreamIndex !== undefined ||
    options.subtitleStreamIndex !== undefined
  const videos =
    options.trackSelection === 'all'
      ? sourceVideos
      : explicitMapping
        ? sourceVideos.slice(0, 1)
        : [...sourceVideos]
            .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))
            .slice(0, 1)
  const sourceAudios = media.streams.filter(
    (stream) =>
      stream.codec_type === 'audio' &&
      (options.audioStreamIndex === undefined || stream.index === options.audioStreamIndex)
  )
  const audios =
    options.audioStreamIndex !== undefined || ['all', 'all_audio'].includes(options.trackSelection)
      ? sourceAudios
      : explicitMapping
        ? sourceAudios.slice(0, 1)
        : [...sourceAudios].sort((a, b) => (b.channels ?? 0) - (a.channels ?? 0)).slice(0, 1)
  const subtitles =
    options.subtitleMode === 'none'
      ? []
      : media.streams.filter(
          (stream) =>
            stream.codec_type === 'subtitle' &&
            (options.subtitleStreamIndex === undefined ||
              stream.index === options.subtitleStreamIndex)
        )
  return { videos, audios, subtitles }
}
