import { parseFfmpegStats } from '../utils/ffmpegStats'
import { renderWithProviders, screen, userEvent } from '@test-utils'
import EncodingProgressPage from '../components/pages/EncodingProgressPage'

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

test('terminal logs can be collapsed and auto-follow can be paused while reading', async () => {
  const user = userEvent.setup()
  const props = {
    progress: 25,
    currentFile: 'source.mp4',
    logs: ['earlier log'],
    onCancel: jest.fn(),
    isEncoding: true
  }
  const { rerender } = renderWithProviders(<EncodingProgressPage {...props} />)
  expect(screen.queryByRole('log')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Show logs' }))
  const log = screen.getByRole('log', { name: 'FFmpeg logs' })
  Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 400 })
  await user.click(screen.getByRole('checkbox', { name: 'Follow latest logs' }))
  log.scrollTop = 45
  rerender(<EncodingProgressPage {...props} logs={['earlier log', 'new log']} />)
  expect(log.scrollTop).toBe(45)
  await user.click(screen.getByRole('checkbox', { name: 'Follow latest logs' }))
  expect(log.scrollTop).toBe(400)
  await user.click(screen.getByRole('button', { name: 'Hide logs' }))
  expect(screen.queryByRole('log')).not.toBeInTheDocument()
})
