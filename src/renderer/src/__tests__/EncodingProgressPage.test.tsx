import { parseFfmpegStats } from '../utils/ffmpegStats'

describe('parseFfmpegStats', () => {
  test('parses current size from a typical ffmpeg status line', () => {
    const stats = parseFfmpegStats([
      'frame=  240 fps=29.9 q=28.0 size=   1.2MiB time=00:00:08.01 bitrate=1224.8kbits/s speed=0.99x'
    ])

    expect(stats).toEqual({
      fps: '29.9',
      time: '00:00:08.01',
      bitrate: '1224.8kbits/s',
      speed: '0.99x',
      size: '1.2MiB'
    })
  })

  test('returns placeholders when no ffmpeg status line exists', () => {
    expect(parseFfmpegStats(['encoding started', 'still working'])).toEqual({
      fps: '--',
      time: '--:--:--',
      bitrate: '--',
      speed: '--',
      size: '--'
    })
  })
})
