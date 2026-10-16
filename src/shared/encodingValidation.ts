import type { EncodingOptions } from '../preload/api.types'
import { canUseTwoPass } from './ffmpegArgs'
import { VIDEO_ENCODERS, maxQualityFor, videoEncoder } from './encoders'

export function encodingIssues(
  options: EncodingOptions,
  supportedNvidiaEncoders?: string[]
): string[] {
  const errors: string[] = []
  const videoCodecs = VIDEO_ENCODERS.map((encoder) => encoder.key)
  if (!['mp4', 'mkv', 'webm', 'mov'].includes(options.container))
    errors.push('Choose a supported output container.')
  if (!videoCodecs.includes(options.videoCodec)) errors.push('Choose a supported video encoder.')
  if (!['aac', 'libopus', 'copy'].includes(options.audioCodec))
    errors.push('Choose a supported audio encoder.')
  if (options.container === 'webm') {
    if (!videoEncoder(options.videoCodec)?.containers.includes('webm'))
      errors.push('WebM requires VP9, AV1, or a compatible copied video stream.')
    if (!['libopus', 'copy'].includes(options.audioCodec))
      errors.push('WebM requires Opus or a compatible copied audio stream.')
  }
  if (['mp4', 'mov'].includes(options.container) && options.videoCodec === 'libvpx-vp9')
    errors.push('Choose WebM or MKV for VP9 video.')
  if (
    options.container === 'mov' &&
    (options.audioCodec === 'libopus' || options.videoCodec.includes('av1'))
  )
    errors.push('Use MP4, MKV, or WebM for the selected codecs instead of MOV.')
  if (
    options.videoCodec.includes('nvenc') &&
    supportedNvidiaEncoders &&
    !supportedNvidiaEncoders.includes(options.videoCodec)
  )
    errors.push('The selected NVIDIA encoder is unavailable on this device.')
  if (options.twoPass && !canUseTwoPass(options))
    errors.push(
      'Two-pass encoding requires average bitrate mode and a supported software video encoder.'
    )
  if (options.videoCodec !== 'copy') {
    if (!['crf', 'bitrate'].includes(options.rateControlMode))
      errors.push('Choose constant quality or average bitrate rate control.')
    const maxQuality = maxQualityFor(options.videoCodec)
    if (options.videoCodec.endsWith('_videotoolbox') && options.rateControlMode !== 'bitrate')
      errors.push('Apple VideoToolbox uses average bitrate mode. Choose a target video bitrate.')
    if (
      options.rateControlMode === 'crf' &&
      (!Number.isFinite(options.crf) || options.crf < 0 || options.crf > maxQuality)
    )
      errors.push(`Quality must be between 0 and ${maxQuality}.`)
    if (
      options.rateControlMode === 'bitrate' &&
      (!Number.isFinite(options.videoBitrate) || options.videoBitrate < 1)
    )
      errors.push('Video bitrate must be greater than zero.')
    if (
      ![
        'ultrafast',
        'superfast',
        'veryfast',
        'faster',
        'fast',
        'medium',
        'slow',
        'slower',
        'veryslow'
      ].includes(options.preset)
    )
      errors.push('Choose a supported encoder preset.')
  }
  if (!Number.isInteger(options.threads) || options.threads < 0 || options.threads > 64)
    errors.push('Threads must be a whole number between 0 and 64.')
  if (!['same', 'mono', 'stereo', '5.1'].includes(options.audioChannels))
    errors.push('Choose a supported audio channel layout.')
  if (options.audioCodec !== 'copy') {
    if (
      !Number.isFinite(options.audioBitrate) ||
      options.audioBitrate < 0 ||
      options.audioBitrate > 2000
    )
      errors.push('Audio bitrate must be between 0 and 2000 kbps.')
    if (!Number.isFinite(options.volumeDb) || Math.abs(options.volumeDb) > 60)
      errors.push('Volume adjustment must be between −60 and 60 dB.')
  }
  if (!['none', 'copy', 'text'].includes(options.subtitleMode))
    errors.push('Choose whether to remove or copy subtitles.')
  if (!['auto', 'all_audio', 'all'].includes(options.trackSelection))
    errors.push('Choose a supported track selection.')
  if (
    options.pixelFormat !== undefined &&
    !['compatible', 'preserve'].includes(options.pixelFormat)
  )
    errors.push('Choose compatible SDR or source pixel format.')
  if (
    options.maxHeight !== undefined &&
    (!Number.isInteger(options.maxHeight) || options.maxHeight < 144 || options.maxHeight > 8640)
  )
    errors.push('Maximum height must be between 144 and 8640 pixels.')
  if (options.maxHeight && options.videoCodec === 'copy')
    errors.push('Resizing requires a video encoder.')
  if (
    options.targetSizeMb !== undefined &&
    (!Number.isFinite(options.targetSizeMb) ||
      options.targetSizeMb <= 0 ||
      options.targetSizeMb > 1_000_000)
  )
    errors.push('Choose a positive target size up to 1,000,000 MB.')
  if (
    options.targetSizeMb &&
    (options.videoCodec === 'copy' || options.rateControlMode !== 'bitrate')
  )
    errors.push('Target size requires average bitrate mode and a video encoder.')
  for (const index of [options.audioStreamIndex, options.subtitleStreamIndex])
    if (index !== undefined && (!Number.isInteger(index) || index < 0 || index > 10000))
      errors.push('Choose a valid source stream index.')
  for (const [value, label] of [
    [options.trimStartSeconds, 'Trim start'],
    [options.trimDurationSeconds, 'Trim duration']
  ] as const)
    if (value !== undefined && (!Number.isFinite(value) || value < 0))
      errors.push(`${label} must be a nonnegative number.`)
  return errors
}
