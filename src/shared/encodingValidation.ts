import type { EncodingOptions } from '../preload/api.types'
import { canUseTwoPass } from './ffmpegArgs'

export function encodingIssues(
  options: EncodingOptions,
  supportedNvidiaEncoders?: string[]
): string[] {
  const errors: string[] = []
  const videoCodecs = [
    'libx264',
    'libx265',
    'libvpx-vp9',
    'h264_nvenc',
    'hevc_nvenc',
    'av1_nvenc',
    'copy'
  ]
  if (!['mp4', 'mkv', 'webm', 'mov'].includes(options.container))
    errors.push('Choose a supported output container.')
  if (!videoCodecs.includes(options.videoCodec)) errors.push('Choose a supported video encoder.')
  if (!['aac', 'libopus', 'copy'].includes(options.audioCodec))
    errors.push('Choose a supported audio encoder.')
  if (options.container === 'webm') {
    if (!['libvpx-vp9', 'av1_nvenc', 'copy'].includes(options.videoCodec))
      errors.push('WebM requires VP9, AV1, or a compatible copied video stream.')
    if (!['libopus', 'copy'].includes(options.audioCodec))
      errors.push('WebM requires Opus or a compatible copied audio stream.')
  }
  if (['mp4', 'mov'].includes(options.container) && options.videoCodec === 'libvpx-vp9')
    errors.push('Choose WebM or MKV for VP9 video.')
  if (
    options.container === 'mov' &&
    (options.audioCodec === 'libopus' || options.videoCodec === 'av1_nvenc')
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
    const maxQuality = options.videoCodec === 'libvpx-vp9' ? 63 : 51
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
  if (!['none', 'copy'].includes(options.subtitleMode))
    errors.push('Choose whether to remove or copy subtitles.')
  if (!['auto', 'all_audio', 'all'].includes(options.trackSelection))
    errors.push('Choose a supported track selection.')
  return errors
}
