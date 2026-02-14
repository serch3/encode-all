import { mockWindowApi, renderWithProviders, screen, userEvent, waitFor } from '@test-utils'
import FfmpegSetup from '../components/ffmpeg/FfmpegSetup'

describe('FfmpegSetup', () => {
  test('renders and shows checking state then not found', async () => {
    mockWindowApi((api) => {
      api.checkFfmpeg.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
        return { isInstalled: false }
      })
    })

    renderWithProviders(<FfmpegSetup isOpen onClose={jest.fn()} />)

    expect(screen.getByText(/FFmpeg Setup/i)).toBeInTheDocument()
    expect(screen.getByText(/Checking FFmpeg installation/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/FFmpeg not found/i)).toBeInTheDocument()
    })
  })

  test('shows installed state', async () => {
    mockWindowApi((api) => {
      api.checkFfmpeg.mockResolvedValue({
        isInstalled: true,
        version: '6.1',
        path: '/usr/bin/ffmpeg'
      })
    })

    renderWithProviders(<FfmpegSetup isOpen onClose={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/FFmpeg is installed/i)).toBeInTheDocument()
      expect(screen.getByText(/Version: 6.1/)).toBeInTheDocument()
    })
  })

  test('renders skip button when not installed and onSkip provided', async () => {
    const onSkip = jest.fn()
    mockWindowApi((api) => {
      api.checkFfmpeg.mockResolvedValue({ isInstalled: false })
    })

    renderWithProviders(<FfmpegSetup isOpen onClose={jest.fn()} onSkip={onSkip} />)

    await waitFor(() => screen.getByText(/FFmpeg not found/i))

    await userEvent.click(screen.getByRole('button', { name: /Skip for now/i }))
    expect(onSkip).toHaveBeenCalled()
  })

  test('click Check Again triggers another status check', async () => {
    const checkSpy = jest.fn()
    mockWindowApi((api) => {
      api.checkFfmpeg.mockImplementation(async () => {
        checkSpy()
        return { isInstalled: false }
      })
    })

    renderWithProviders(<FfmpegSetup isOpen onClose={jest.fn()} />)
    await waitFor(() => screen.getByText(/FFmpeg not found/i))

    await userEvent.click(screen.getByRole('button', { name: /Check Again/i }))

    await waitFor(() => expect(checkSpy).toHaveBeenCalledTimes(2))
  })

  test('manual download card triggers openExternal', async () => {
    const externalUrl = 'https://ffmpeg.org/download.html'
    const apiMock = mockWindowApi((api) => {
      api.checkFfmpeg.mockResolvedValue({ isInstalled: false })
    })
    apiMock.openExternal.mockResolvedValue(undefined)

    renderWithProviders(<FfmpegSetup isOpen onClose={jest.fn()} />)

    await waitFor(() => screen.getByText(/FFmpeg not found/i))

    await userEvent.click(screen.getByText(/Download from FFmpeg.org/i))
    expect(apiMock.openExternal).toHaveBeenCalledWith(externalUrl)
  })

  test('select existing installation triggers selectFfmpegPath and re-check', async () => {
    const apiMock = mockWindowApi((api) => {
      api.checkFfmpeg.mockImplementation(async () => ({ isInstalled: false }))
      api.selectFfmpegPath.mockResolvedValue('/custom/ffmpeg')
    })

    renderWithProviders(<FfmpegSetup isOpen onClose={jest.fn()} />)

    await waitFor(() => screen.getByText(/FFmpeg not found/i))

    await userEvent.click(screen.getByText(/Select Existing Installation/i))

    await waitFor(() => expect(apiMock.selectFfmpegPath).toHaveBeenCalled())
    expect(apiMock.checkFfmpeg).toHaveBeenCalledTimes(2)
  })
})
