import { renderWithProviders, screen } from '@test-utils'
import EncodingSettings from '../components/encoding/EncodingSettings'

const settings = {
  container: 'mp4',
  videoCodec: 'libx264',
  audioCodec: 'aac',
  audioChannels: 'same',
  audioBitrate: 128,
  volumeDb: 0,
  crf: 23,
  preset: 'medium',
  threads: 0,
  trackSelection: 'auto',
  twoPass: false,
  subtitleMode: 'none',
  videoBitrate: 1000,
  rateControlMode: 'crf' as const,
  isEncoding: false,
  hasNvidiaGpu: true,
  isNvenc: false,
  setContainer: jest.fn(),
  setVideoCodec: jest.fn(),
  setAudioCodec: jest.fn(),
  setAudioChannels: jest.fn(),
  setAudioBitrate: jest.fn(),
  setVolumeDb: jest.fn(),
  setCrf: jest.fn(),
  setPreset: jest.fn(),
  setThreads: jest.fn(),
  setTrackSelection: jest.fn(),
  setTwoPass: jest.fn(),
  setSubtitleMode: jest.fn(),
  setVideoBitrate: jest.fn(),
  setRateControlMode: jest.fn()
}

test('hides AV1 NVENC when an older NVIDIA GPU supports only H.264 and HEVC', () => {
  renderWithProviders(
    <EncodingSettings {...settings} supportedNvidiaEncoders={['h264_nvenc', 'hevc_nvenc']} />
  )
  expect(screen.getByRole('option', { name: 'H.264 (NVIDIA NVENC)' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'H.265 (NVIDIA NVENC)' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'AV1 (NVIDIA NVENC)' })).not.toBeInTheDocument()
})

test('keeps a saved hardware codec while GPU checks are pending', () => {
  renderWithProviders(
    <EncodingSettings
      {...settings}
      videoCodec="av1_nvenc"
      hasNvidiaGpu={false}
      isCheckingHardware
    />
  )
  expect(settings.setVideoCodec).not.toHaveBeenCalled()
})
