import { renderWithProviders, screen, mockWindowApi, waitFor } from '@test-utils'
import userEvent from '@testing-library/user-event'
import HistoryPage from '../components/pages/HistoryPage'

test('shows real output paths and savings and delegates native output actions', async () => {
  const api = mockWindowApi((mock) =>
    mock.getEncodingHistory.mockResolvedValue([
      {
        id: 'result',
        inputPath: '/source.mov',
        outputPath: '/out/source.mp4',
        inputSize: 20_000_000,
        outputSize: 10_000_000,
        startedAt: 1000,
        completedAt: 3000,
        videoCodec: 'libx264',
        container: 'mp4'
      }
    ])
  )
  renderWithProviders(<HistoryPage />)
  expect(await screen.findByText('/out/source.mp4')).toBeInTheDocument()
  expect(screen.getByText('50% smaller')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Reveal file' }))
  expect(api.openOutput).toHaveBeenCalledWith('result', true)
  api.openOutput.mockRejectedValueOnce(new Error('Output file was moved'))
  await userEvent.click(screen.getByRole('button', { name: 'Open video' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('moved')
  await userEvent.click(screen.getByRole('button', { name: 'Clear history' }))
  expect(api.clearEncodingHistory).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Clear records' }))
  await waitFor(() => expect(api.clearEncodingHistory).toHaveBeenCalledTimes(1))
})
