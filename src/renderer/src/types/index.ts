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
  ffmpegPath?: string
  logDirectory?: string
  jobTimestamp?: string
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

/**
 * A single stream (video, audio, subtitle) from ffprobe
 */
export interface MediaStream {
  index: number
  codec_type: 'video' | 'audio' | 'subtitle' | 'data' | string
  codec_name: string
  profile?: string
  // video
  width?: number
  height?: number
  r_frame_rate?: string
  pix_fmt?: string
  // audio
  channels?: number
  channel_layout?: string
  sample_rate?: string
  // both
  bit_rate?: string
  tags?: Record<string, string>
}

/**
 * Parsed output of ffprobe -show_streams -show_format
 */
export interface MediaInfo {
  streams: MediaStream[]
  format: {
    duration?: string
    bit_rate?: string
    size?: string
    format_name?: string
  }
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
  /** Populated asynchronously after enqueue via ffprobe */
  mediaInfo?: MediaInfo
  /** True if ffprobe failed for this file */
  mediaInfoError?: boolean
}
