/**
 * Shared TypeScript type definitions
 */

/**
 * Represents a video file in the encoding queue
 */
export interface VideoFile {
  name: string
  path: string
  size: number
  modified: number
}

/**
 * FFmpeg installation status information
 */
export interface FfmpegStatus {
  isInstalled: boolean
  version?: string
  path?: string
  error?: string
}

/**
 * Pattern tokens for filename renaming
 */
export interface PatternTokens {
  name: string
  codec: string
  ext: string
}

/**
 * Encoding job status (todo: implement this)
 */
export interface EncodingJob {
  id: string
  file: VideoFile
  status: 'pending' | 'encoding' | 'complete' | 'error'
  progress: number
  startTime?: number
  endTime?: number
  error?: string
}

/**
 * Encoding configuration
 */
export interface EncodingConfig {
  container: string
  videoCodec: string
  audioCodec: string
  audioChannels: string
  audioBitrate: number
  volumeDb: number
  threads: number
  outputDirectory: string
  renamePattern: string
}

export interface EncodingOptions {
  inputPath: string
  outputPath: string
  container: string
  videoCodec: string
  audioCodec: string
  audioChannels: string
  audioBitrate: number
  volumeDb: number
  crf: number
  preset: string
  threads: number
  trackSelection: string
  twoPass: boolean
  subtitleMode: string
  videoBitrate: number
  rateControlMode: 'crf' | 'bitrate'
}

/**
 * Saved encoding profile
 */
export interface EncodingProfile {
  id: string
  name: string
  container: string
  videoCodec: string
  audioCodec: string
  audioChannels: string
  audioBitrate: number
  volumeDb: number
  threads: number
  trackSelection: string
  crf: number
  preset: string
  renamePattern: string
  twoPass: boolean
  subtitleMode: string
  videoBitrate: number
  rateControlMode: 'crf' | 'bitrate'
}

export type JobStatus = 'pending' | 'encoding' | 'complete' | 'error' | 'canceled'

export interface QueuedJob {
  id: string
  file: VideoFile
  status: JobStatus
  progress: number
  attempts: number
  maxRetries: number
  error?: string
  overrides?: Partial<EncodingOptions>
}
