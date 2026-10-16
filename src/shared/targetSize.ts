import { selectedMediaStreams } from './mediaValidation'
import type { EncodingOptions, MediaInfo } from '../preload/api.types'

/** A target is approximate: reserve 3% for muxing and subtract the audio budget. */
export function bitrateForTargetSize(
  targetMb: number,
  durationSeconds: number,
  audioKbps: number
): number {
  if (
    !Number.isFinite(targetMb) ||
    targetMb <= 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  )
    throw new Error('A target size needs a positive size and a known source duration.')
  const bitrate = Math.floor((targetMb * 1_000_000 * 8 * 0.97) / durationSeconds / 1000 - audioKbps)
  if (bitrate < 50)
    throw new Error(
      'This target is too small for the duration and audio tracks. Increase the target size.'
    )
  return bitrate
}

export function withTargetSize(options: EncodingOptions, media: MediaInfo): EncodingOptions {
  if (!options.targetSizeMb) return options
  const selected = selectedMediaStreams(options, media).audios
  const budget =
    options.audioCodec === 'copy'
      ? selected.reduce((sum, stream) => sum + (Number(stream.bit_rate) / 1000 || 160), 0)
      : selected.length * (options.audioBitrate || 160)
  return {
    ...options,
    videoBitrate: bitrateForTargetSize(options.targetSizeMb, Number(media.format.duration), budget),
    sourceDurationSeconds: Number(media.format.duration)
  }
}
