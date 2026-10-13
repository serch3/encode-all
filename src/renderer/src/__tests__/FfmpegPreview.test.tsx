import { renderWithProviders, screen, mockWindowApi } from '@test-utils'
import FfmpegPreview from '../components/ffmpeg/FfmpegPreview'
import { useEncodingConfig } from '../hooks/useEncodingConfig'
import type { QueuedJob } from '../types'

const job: QueuedJob = {
  id: 'command',
  file: { name: 'Holiday final.mp4', path: '/videos/Holiday final.mp4', size: 1, modified: 1 },
  status: 'pending',
  progress: 0,
  attempts: 0,
  maxRetries: 0,
  overrides: { container: 'webm', videoCodec: 'libvpx-vp9', audioCodec: 'libopus', crf: 32 }
}
function Harness(): React.JSX.Element {
  const config = useEncodingConfig()
  return <FfmpegPreview job={job} config={config} />
}

test('the command uses the selected file, its overrides, and the actual output filename', async () => {
  mockWindowApi()
  localStorage.setItem('config-outputDirectory', JSON.stringify('/exports'))
  renderWithProviders(<Harness />)
  const command = await screen.findByText(/-c:v libvpx-vp9/)
  expect(command).toHaveTextContent('"/videos/Holiday final.mp4"')
  expect(command).toHaveTextContent('-c:a libopus')
  expect(command).toHaveTextContent('-crf 32')
  expect(command).toHaveTextContent('/exports/Holiday_final_vpx-vp9.webm')
})
