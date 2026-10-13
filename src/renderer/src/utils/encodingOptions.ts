import type { EncodingOptions, QueuedJob } from '../types'
import type { EncodingConfig } from '../hooks/useEncodingConfig'

export function previewEncodingOptions(
  job: QueuedJob,
  config: EncodingConfig,
  ffmpegPath?: string
): EncodingOptions {
  const overrides = job.overrides
  return {
    inputPath: job.file.path,
    outputPath: '',
    container: overrides?.container ?? config.container,
    videoCodec: overrides?.videoCodec ?? config.videoCodec,
    audioCodec: overrides?.audioCodec ?? config.audioCodec,
    audioChannels: overrides?.audioChannels ?? config.audioChannels,
    audioBitrate: overrides?.audioBitrate ?? config.audioBitrate,
    volumeDb: overrides?.volumeDb ?? config.volumeDb,
    crf: overrides?.crf ?? config.crf,
    preset: overrides?.preset ?? config.preset,
    threads: overrides?.threads ?? config.threads,
    trackSelection: overrides?.trackSelection ?? config.trackSelection,
    twoPass: overrides?.twoPass ?? config.twoPass,
    subtitleMode: overrides?.subtitleMode ?? config.subtitleMode,
    videoBitrate: overrides?.videoBitrate ?? config.videoBitrate,
    rateControlMode: overrides?.rateControlMode ?? config.rateControlMode,
    enableLogging: false,
    ffmpegPath
  }
}
