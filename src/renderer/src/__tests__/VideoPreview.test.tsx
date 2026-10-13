import { fireEvent } from '@testing-library/react'
import { mockWindowApi, renderWithProviders, screen, userEvent, waitFor } from '@test-utils'
import VideoPreview from '../components/ffmpeg/VideoPreview'
import { useEncodingConfig } from '../hooks/useEncodingConfig'
import { useVideoPreview } from '../hooks/useVideoPreview'
import type { QueuedJob } from '../types'

const job: QueuedJob = {
  id: 'job-preview',
  file: { name: 'sample.mp4', path: '/video/sample.mp4', size: 1, modified: 1 },
  status: 'pending',
  progress: 0,
  attempts: 0,
  maxRetries: 0,
  overrides: { videoCodec: 'libx264', crf: 18, container: 'mp4' }
}
function Harness({ jobs = [job] }: { jobs?: QueuedJob[] }): React.JSX.Element {
  const config = useEncodingConfig()
  const preview = useVideoPreview({
    jobs,
    config,
    ready: true,
    isEncoding: false,
    ffmpegPath: '/bin/ffmpeg'
  })
  return (
    <VideoPreview
      preview={preview}
      onAdjustSettings={jest.fn()}
      onOpenQueue={jest.fn()}
      onSetupFfmpeg={jest.fn()}
    />
  )
}

test('generates a bounded sample with queue overrides and opens the actual encoded file', async () => {
  const api = mockWindowApi()
  const { unmount } = renderWithProviders(<Harness />)
  await userEvent.click(screen.getByRole('button', { name: 'Generate Preview' }))
  await waitFor(() =>
    expect(api.createPreview).toHaveBeenCalledWith({
      encoding: expect.objectContaining({
        inputPath: job.file.path,
        videoCodec: 'libx264',
        crf: 18,
        container: 'mp4',
        ffmpegPath: '/bin/ffmpeg'
      }),
      startSeconds: 0,
      durationSeconds: 10
    })
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Open in System Player' }))
  expect(api.openPreview).toHaveBeenCalledWith('preview-test')
  unmount()
  expect(api.releasePreview).toHaveBeenCalledWith('preview-test')
})

test('blocks previews longer than 30 seconds and negative start times', () => {
  const api = mockWindowApi()
  renderWithProviders(<Harness />)
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Duration (seconds)' }), {
    target: { value: '31' }
  })
  expect(screen.getByRole('button', { name: 'Generate Preview' })).toBeDisabled()
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Duration (seconds)' }), {
    target: { value: '10' }
  })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Start time (seconds)' }), {
    target: { value: '-1' }
  })
  expect(screen.getByRole('button', { name: 'Generate Preview' })).toBeDisabled()
  expect(api.createPreview).not.toHaveBeenCalled()
})

test('shows playback fallback and warns when settings change after generating', async () => {
  mockWindowApi()
  renderWithProviders(<Harness />)
  await userEvent.click(screen.getByRole('button', { name: 'Generate Preview' }))
  const video = await screen.findByLabelText('Encoded quality preview')
  fireEvent.error(video)
  expect(screen.getByText(/This format needs a system player/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Duration (seconds)' }), {
    target: { value: '5' }
  })
  expect(screen.getByRole('status')).toHaveTextContent('Settings changed')
})

test('allows cancellation without starting the batch', async () => {
  const api = mockWindowApi()
  let reject!: (error: Error) => void
  api.createPreview.mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail
      })
  )
  api.cancelPreview.mockImplementation(async () => reject(new Error('Preview canceled')))
  renderWithProviders(<Harness />)
  await userEvent.click(screen.getByRole('button', { name: 'Generate Preview' }))
  await waitFor(() => expect(api.createPreview).toHaveBeenCalled())
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel Preview' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Preview canceled')
  expect(api.startEncoding).not.toHaveBeenCalled()
})

test('opens the generated sample in its own preview window', async () => {
  const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const api = mockWindowApi()
  renderWithProviders(<Harness />)
  await userEvent.click(screen.getByRole('button', { name: 'Generate Preview' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Open Preview Window' }))
  expect(api.openPreviewWindow).toHaveBeenCalledWith('preview-test')
  expect(pause).toHaveBeenCalled()
  pause.mockRestore()
})

test('canceling before preview creation prevents encoding from starting', async () => {
  const api = mockWindowApi()
  renderWithProviders(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Generate Preview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Preview' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Preview canceled')
  expect(api.createPreview).not.toHaveBeenCalled()
})

test('a finished clip remains viewable after its source leaves the queue', async () => {
  const api = mockWindowApi()
  const { rerender } = renderWithProviders(<Harness />)
  await userEvent.click(screen.getByRole('button', { name: 'Generate Preview' }))
  await screen.findByLabelText('Encoded quality preview')
  rerender(<Harness jobs={[]} />)
  expect(screen.getByLabelText('Encoded quality preview')).toBeInTheDocument()
  expect(screen.queryByText(/Settings changed/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate Preview' })).toBeDisabled()
  expect(api.releasePreview).not.toHaveBeenCalled()
})
