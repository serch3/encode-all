import { act, renderHook, waitFor, mockWindowApi } from '@test-utils'
import { useBatchReview } from '../hooks/useBatchReview'
import { useEncodingConfig } from '../hooks/useEncodingConfig'
import type { QueuedJob } from '../types'
import type { BatchReviewEntry, BatchReviewRequest } from '../../../preload/api.types'

const job: QueuedJob = {
  id: 'one',
  file: { name: 'source.mp4', path: '/media/source.mp4', size: 1, modified: 1 },
  status: 'pending',
  progress: 0,
  attempts: 0,
  maxRetries: 0,
  overrides: { container: 'webm', videoCodec: 'libvpx-vp9', audioCodec: 'libopus' }
}

test('reviews actual effective settings and invalidates the result after settings change', async () => {
  const api = mockWindowApi()
  const { result } = renderHook(() => {
    const config = useEncodingConfig()
    return { config, review: useBatchReview([job], [job.file.path], config, '/ffmpeg') }
  })
  await act(async () => {
    await result.current.review.review()
  })
  expect(api.reviewBatchOutputs).toHaveBeenCalledWith(
    expect.objectContaining({
      jobs: [
        expect.objectContaining({
          encoding: expect.objectContaining({
            container: 'webm',
            videoCodec: 'libvpx-vp9',
            audioCodec: 'libopus',
            ffmpegPath: '/ffmpeg'
          })
        })
      ]
    })
  )
  expect(result.current.review.canStart).toBe(true)
  act(() => result.current.config.setRenamePattern('{name}_new'))
  expect(result.current.review.stale).toBe(true)
  expect(result.current.review.canStart).toBe(false)
})

test('closing a pending review discards its eventual response', async () => {
  let finish!: (entries: BatchReviewEntry[]) => void
  let request!: BatchReviewRequest
  const api = mockWindowApi((mock) =>
    mock.reviewBatchOutputs.mockImplementation((value) => {
      request = value
      return new Promise((resolve) => {
        finish = resolve
      })
    })
  )
  const { result } = renderHook(() => {
    const config = useEncodingConfig()
    return useBatchReview([job], [job.file.path], config)
  })
  act(() => {
    void result.current.review()
  })
  await waitFor(() => expect(api.reviewBatchOutputs).toHaveBeenCalled())
  act(() => result.current.close())
  await act(async () => {
    finish(
      request.jobs.map((item) => ({
        jobId: item.jobId,
        name: item.name,
        inputPath: item.encoding.inputPath,
        outputPath: item.encoding.outputPath,
        encoding: item.encoding,
        errors: [],
        warnings: []
      }))
    )
  })
  expect(result.current.isOpen).toBe(false)
  expect(result.current.entries).toEqual([])
  expect(result.current.canStart).toBe(false)
})
