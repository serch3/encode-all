import { mockWindowApi, renderWithProviders, screen, userEvent, waitFor } from '@test-utils'
import App from '../App'

jest.mock('../components/encoding', () => ({
  __esModule: true,
  QueueDrawer: () => null,
  ProfileManager: () => null,
  EncodingSettings: () => <div data-testid="encoding-settings" />
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

  test('skip sets ffmpegChecked true and hides modal', async () => {
    mockWindowApi((api) => {
      api.checkFfmpeg.mockResolvedValue({ isInstalled: false })
    })

    renderWithProviders(<App />)
    await waitFor(() => screen.getByText(/FFmpeg Setup/i))

    await userEvent.click(await screen.findByRole('button', { name: /Skip for now/i }))

    await waitFor(() => {
      expect(screen.queryByText(/FFmpeg Setup/i)).not.toBeInTheDocument()
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
