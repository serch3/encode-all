import type { EncodingProfile } from '../types'

export interface StarterProfile extends EncodingProfile {
  description: string
}

const defaults: Omit<
  EncodingProfile,
  'id' | 'name' | 'container' | 'videoCodec' | 'crf' | 'preset'
> = {
  audioCodec: 'aac',
  audioChannels: 'same',
  audioBitrate: 160,
  volumeDb: 0,
  threads: 0,
  trackSelection: 'auto',
  renamePattern: '{name}_{codec}',
  twoPass: false,
  subtitleMode: 'none',
  videoBitrate: 2500,
  rateControlMode: 'crf'
}

export const STARTER_PROFILES: StarterProfile[] = [
  {
    ...defaults,
    id: 'starter-balanced-mp4',
    name: 'Balanced MP4',
    container: 'mp4',
    videoCodec: 'libx264',
    crf: 23,
    preset: 'medium',
    description: 'A starting point for everyday playback. H.264 video and AAC audio in MP4.'
  },
  {
    ...defaults,
    id: 'starter-fast-mp4',
    name: 'Fast MP4',
    container: 'mp4',
    videoCodec: 'libx264',
    crf: 23,
    preset: 'veryfast',
    description: 'Prioritizes encoding speed. Files may be larger than with the balanced profile.'
  },
  {
    ...defaults,
    id: 'starter-compact-hevc',
    name: 'Compact HEVC',
    container: 'mkv',
    videoCodec: 'libx265',
    crf: 25,
    preset: 'slow',
    description: 'Prioritizes compression. Slower encoding; playback needs an HEVC-capable player.'
  },
  {
    ...defaults,
    id: 'starter-webm',
    name: 'WebM',
    container: 'webm',
    videoCodec: 'libvpx-vp9',
    audioCodec: 'libopus',
    audioBitrate: 128,
    crf: 32,
    preset: 'medium',
    description: 'VP9 video and Opus audio for WebM output. Software encoding can take longer.'
  }
]

export function profileSettingsKey(profile: Omit<EncodingProfile, 'id' | 'name'>): string {
  return JSON.stringify([
    profile.container,
    profile.videoCodec,
    profile.audioCodec,
    profile.audioChannels,
    profile.audioBitrate,
    profile.volumeDb,
    profile.threads,
    profile.trackSelection,
    profile.crf,
    profile.preset,
    profile.renamePattern,
    profile.twoPass ?? false,
    profile.subtitleMode ?? 'none',
    profile.videoBitrate ?? 2500,
    profile.rateControlMode ?? 'crf'
  ])
}
