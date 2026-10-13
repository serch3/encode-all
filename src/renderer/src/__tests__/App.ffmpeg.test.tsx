import { mockWindowApi, renderWithProviders, screen, userEvent, waitFor } from '@test-utils'
import App from '../App'

jest.mock('../components/encoding', () => ({
  __esModule: true,
  QueueDrawer: ({ onSelectAll }: { onSelectAll?: () => void }) => (
    <button onClick={() => onSelectAll?.()}>Select all queued videos</button>
  ),
  ProfileManager: () => null,
  EncodingSettings: () => <div data-testid="encoding-settings" />,
  FloatingProgress: () => null
}))

jest.mock('../components/pages', () => ({
  __esModule: true,
  GeneralPage: ({ encoderContent }: { encoderContent?: React.ReactNode }) => (
    <div data-testid="general-page">{encoderContent}</div>
  ),
  SettingsPage: () => <div data-testid="settings-page" />,
  AboutPage: () => <div data-testid="about-page" />
}))

describe('App FFmpeg integration', () => {
  test('shows setup modal when ffmpeg not installed', async () => {
    mockWindowApi((api) => {
      api.checkFfmpeg.mockResolvedValue({ isInstalled: false })
    })

    renderWithProviders(<App />)

    await waitFor(() => screen.getByText(/FFmpeg Setup/i))
    expect(screen.getByText(/FFmpeg not found/i)).toBeInTheDocument()
  })

  test('skip hides setup while encoding remains disabled', async () => {
    mockWindowApi((api) => {
      api.checkFfmpeg.mockResolvedValue({ isInstalled: false })
    })

    renderWithProviders(<App />)
    await waitFor(() => screen.getByText(/FFmpeg Setup/i))

    await userEvent.click(await screen.findByRole('button', { name: /Skip for now/i }))

    await waitFor(() => {
      expect(screen.queryByText(/^FFmpeg Setup$/i)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Start Encoding' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Set up FFmpeg' })).toBeEnabled()
    })
  })

  test('installed ffmpeg enables Start Encoding', async () => {
    mockWindowApi((api) => {
      api.checkFfmpeg.mockResolvedValue({ isInstalled: true })
    })

    renderWithProviders(<App />)

    await waitFor(() => {
      expect(screen.queryByText(/FFmpeg Setup/i)).not.toBeInTheDocument()
    })
  })
})

test('completed selections stay disabled and explain what to do next', async () => {
  mockWindowApi((api) => {
    api.checkFfmpeg.mockResolvedValue({ isInstalled: true })
  })
  localStorage.setItem(
    'queue-state',
    JSON.stringify([
      {
        id: 'done',
        file: { name: 'done.mp4', path: '/done.mp4', size: 1, modified: 1 },
        status: 'complete',
        progress: 100,
        attempts: 1,
        maxRetries: 0
      }
    ])
  )
  renderWithProviders(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'Select all queued videos' }))
  await waitFor(() =>
    expect(screen.getByText(/selected videos are already complete/)).toBeInTheDocument()
  )
  expect(screen.getByRole('button', { name: 'Start Encoding' })).toBeDisabled()
  expect(window.api.startEncoding).not.toHaveBeenCalled()
})

test('output filename preview includes the selected file, overrides, and extension', async () => {
  mockWindowApi((api) => {
    api.checkFfmpeg.mockResolvedValue({ isInstalled: true })
    api.readTextFile.mockResolvedValue(
      JSON.stringify([
        {
          id: 'first',
          file: { name: 'Holiday.mp4', path: '/Holiday.mp4', size: 1, modified: 1 },
          overrides: { container: 'webm', videoCodec: 'libvpx-vp9' }
        }
      ])
    )
  })
  renderWithProviders(<App />)
  await screen.findByText('Add videos to start your first batch.')
  await userEvent.click(screen.getByRole('button', { name: 'Load Queue' }))
  expect(await screen.findByText('First output: Holiday_vpx-vp9.webm')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Encode 1 file' })).toBeEnabled()
})

test('an empty folder explains the result without starting a batch', async () => {
  mockWindowApi((api) => {
    api.checkFfmpeg.mockResolvedValue({ isInstalled: true })
    api.selectFolder.mockResolvedValue('/empty')
    api.readVideoFiles.mockResolvedValue([])
  })
  renderWithProviders(<App />)
  await screen.findByText('Add videos to start your first batch.')
  await userEvent.click(screen.getByRole('button', { name: 'Browse Folder' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No supported videos were found in this folder'
  )
  expect(window.api.startEncoding).not.toHaveBeenCalled()
})

test('the output folder can be reset to save beside source files', async () => {
  mockWindowApi((api) => {
    api.checkFfmpeg.mockResolvedValue({ isInstalled: true })
  })
  localStorage.setItem('config-outputDirectory', JSON.stringify('/custom/output'))
  renderWithProviders(<App />)
  await screen.findByText('Add videos to start your first batch.')
  await userEvent.click(screen.getByRole('button', { name: 'Use input folders instead' }))
  expect(screen.getByRole('textbox', { name: 'Output directory' })).toHaveValue('')
  expect(
    screen.getByText('Encoded files will be saved beside each source video.')
  ).toBeInTheDocument()
})

test('the dedicated Preview tab retains its clip when switching back to settings', async () => {
  const api = mockWindowApi((mock) => {
    mock.checkFfmpeg.mockResolvedValue({ isInstalled: true })
  })
  localStorage.setItem(
    'queue-state',
    JSON.stringify([
      {
        id: 'preview-source',
        file: { name: 'source.mp4', path: '/source.mp4', size: 1, modified: 1 },
        status: 'pending',
        progress: 0,
        attempts: 0,
        maxRetries: 0,
        overrides: { container: 'mp4', videoCodec: 'libx264' }
      }
    ])
  )
  renderWithProviders(<App />)
  await screen.findByText('Select videos in the queue to encode them.')
  expect(screen.queryByRole('button', { name: 'Generate Preview' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  await userEvent.click(screen.getByRole('button', { name: 'Generate Preview' }))
  expect(await screen.findByLabelText('Encoded quality preview')).toHaveAttribute(
    'src',
    'encode-preview://clip/preview-test'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Encode videos' }))
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(screen.getByLabelText('Encoded quality preview')).toHaveAttribute(
    'src',
    'encode-preview://clip/preview-test'
  )
  expect(api.createPreview).toHaveBeenCalledTimes(1)
  expect(api.releasePreview).not.toHaveBeenCalled()
})

test('encoding requires a successful output review and explicit Start batch', async () => {
  const api = mockWindowApi((mock) => {
    mock.checkFfmpeg.mockResolvedValue({ isInstalled: true })
    mock.startEncoding.mockRejectedValue(new Error('Stop test encode'))
  })
  localStorage.setItem(
    'queue-state',
    JSON.stringify([
      {
        id: 'one',
        file: { name: 'source.mp4', path: '/source.mp4', size: 1, modified: 1 },
        status: 'pending',
        progress: 0,
        attempts: 0,
        maxRetries: 0
      }
    ])
  )
  renderWithProviders(<App />)
  await screen.findByText('Select videos in the queue to encode them.')
  await userEvent.click(screen.getByRole('button', { name: 'Select all queued videos' }))
  await userEvent.click(screen.getByRole('button', { name: 'Encode 1 file' }))
  expect(await screen.findByText('Review batch outputs')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start batch' })).toBeEnabled())
  expect(api.startEncoding).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Start batch' }))
  await waitFor(() => expect(api.startEncoding).toHaveBeenCalled())
  expect(api.startEncoding.mock.calls[0][0].outputPath).toBe(
    api.reviewBatchOutputs.mock.results[0].value instanceof Promise
      ? (await api.reviewBatchOutputs.mock.results[0].value)[0].outputPath
      : ''
  )
})

test('a failed output review blocks the batch and exposes the problem', async () => {
  const api = mockWindowApi((mock) => {
    mock.checkFfmpeg.mockResolvedValue({ isInstalled: true })
    mock.reviewBatchOutputs.mockImplementation(async (request) =>
      request.jobs.map((job) => ({
        jobId: job.jobId,
        name: job.name,
        inputPath: job.encoding.inputPath,
        outputPath: job.encoding.outputPath,
        encoding: job.encoding,
        errors: ['The source video is missing.'],
        warnings: []
      }))
    )
  })
  localStorage.setItem(
    'queue-state',
    JSON.stringify([
      {
        id: 'one',
        file: { name: 'source.mp4', path: '/source.mp4', size: 1, modified: 1 },
        status: 'pending',
        progress: 0,
        attempts: 0,
        maxRetries: 0
      }
    ])
  )
  renderWithProviders(<App />)
  await screen.findByText('Select videos in the queue to encode them.')
  await userEvent.click(screen.getByRole('button', { name: 'Select all queued videos' }))
  await userEvent.click(screen.getByRole('button', { name: 'Encode 1 file' }))
  expect(await screen.findByText('The source video is missing.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Start batch' })).toBeDisabled()
  expect(api.startEncoding).not.toHaveBeenCalled()
})
