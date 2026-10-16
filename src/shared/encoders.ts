export interface VideoEncoder {
  key: string
  label: string
  backend: 'software' | 'nvidia' | 'apple' | 'intel' | 'amd' | 'copy'
  containers: string[]
  maxQuality: number
}

const general = ['mp4', 'mkv', 'mov']
const av1 = ['mp4', 'mkv', 'webm']
export const VIDEO_ENCODERS: VideoEncoder[] = [
  {
    key: 'libx264',
    label: 'H.264 (libx264)',
    backend: 'software',
    containers: general,
    maxQuality: 51
  },
  {
    key: 'libx265',
    label: 'H.265 (libx265)',
    backend: 'software',
    containers: general,
    maxQuality: 51
  },
  {
    key: 'libvpx-vp9',
    label: 'VP9 (libvpx-vp9)',
    backend: 'software',
    containers: ['mkv', 'webm'],
    maxQuality: 63
  },
  {
    key: 'libsvtav1',
    label: 'AV1 (SVT-AV1)',
    backend: 'software',
    containers: av1,
    maxQuality: 63
  },
  {
    key: 'h264_nvenc',
    label: 'H.264 (NVIDIA NVENC)',
    backend: 'nvidia',
    containers: general,
    maxQuality: 51
  },
  {
    key: 'hevc_nvenc',
    label: 'H.265 (NVIDIA NVENC)',
    backend: 'nvidia',
    containers: general,
    maxQuality: 51
  },
  {
    key: 'av1_nvenc',
    label: 'AV1 (NVIDIA NVENC)',
    backend: 'nvidia',
    containers: av1,
    maxQuality: 63
  },
  {
    key: 'h264_videotoolbox',
    label: 'H.264 (Apple VideoToolbox)',
    backend: 'apple',
    containers: general,
    maxQuality: 51
  },
  {
    key: 'hevc_videotoolbox',
    label: 'H.265 (Apple VideoToolbox)',
    backend: 'apple',
    containers: general,
    maxQuality: 51
  },
  {
    key: 'h264_qsv',
    label: 'H.264 (Intel Quick Sync)',
    backend: 'intel',
    containers: general,
    maxQuality: 51
  },
  {
    key: 'hevc_qsv',
    label: 'H.265 (Intel Quick Sync)',
    backend: 'intel',
    containers: general,
    maxQuality: 51
  },
  {
    key: 'av1_qsv',
    label: 'AV1 (Intel Quick Sync)',
    backend: 'intel',
    containers: av1,
    maxQuality: 51
  },
  {
    key: 'h264_amf',
    label: 'H.264 (AMD AMF)',
    backend: 'amd',
    containers: general,
    maxQuality: 51
  },
  {
    key: 'hevc_amf',
    label: 'H.265 (AMD AMF)',
    backend: 'amd',
    containers: general,
    maxQuality: 51
  },
  { key: 'av1_amf', label: 'AV1 (AMD AMF)', backend: 'amd', containers: av1, maxQuality: 63 },
  {
    key: 'copy',
    label: 'Copy',
    backend: 'copy',
    containers: ['mp4', 'mkv', 'mov', 'webm'],
    maxQuality: 51
  }
]

export const videoEncoder = (codec: string): VideoEncoder | undefined =>
  VIDEO_ENCODERS.find((encoder) => encoder.key === codec)
export const isHardwareEncoder = (codec: string): boolean =>
  !['software', 'copy'].includes(videoEncoder(codec)?.backend ?? 'software')

export function maxQualityFor(codec: string): number {
  return videoEncoder(codec)?.maxQuality ?? 51
}
