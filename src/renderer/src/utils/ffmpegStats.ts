export interface FfmpegStats {
  fps: string
  time: string
  bitrate: string
  speed: string
  size: string
}

export const parseFfmpegStats = (logs: string[]): FfmpegStats => {
  const statusLine = [...logs]
    .reverse()
    .find((log) => log.includes('frame=') || log.includes('fps='))

  if (!statusLine) {
    return { fps: '--', time: '--:--:--', bitrate: '--', speed: '--', size: '--' }
  }

  const fps = statusLine.match(/fps=\s*([\d.]+)/)?.[1] || '--'
  const time = statusLine.match(/time=\s*([\d:.]+)/)?.[1] || '--:--:--'
  const bitrate = statusLine.match(/bitrate=\s*([\d.]+kbits\/s)/)?.[1] || '--'
  const speed = statusLine.match(/speed=\s*([\d.]+x)/)?.[1] || '--'
  const size = statusLine.match(/size=\s*([^\s]+\s?[kMGT]?i?B)/)?.[1] || '--'

  return { fps, time, bitrate, speed, size }
}
