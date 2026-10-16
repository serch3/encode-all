import { act, renderHook, waitFor } from '@test-utils'
import { mockWindowApi } from '@test-utils'
import { useQueueManager, durableQueueChanged } from '../hooks/useQueueManager'
import type { QueuedJob, VideoFile } from '../types'

const mediaInfo = {
  streams: [],
  format: { duration: '10.0', bit_rate: '1000', size: '10000', format_name: 'mp4' }
}

const fileA: VideoFile = {
  name: 'alpha.mp4',
  path: '/videos/alpha.mp4',
  size: 100,
  modified: 1
}

const fileB: VideoFile = {
  name: 'beta.mp4',
  path: '/videos/beta.mp4',
  size: 200,
  modified: 2
}

const fileC: VideoFile = {
  name: 'gamma.mp4',
  path: '/videos/gamma.mp4',
  size: 300,
  modified: 3
}

describe('useQueueManager', () => {
  test('restores interrupted jobs and preserves valid queue settings on import', async () => {
    mockWindowApi((api) => {
      api.loadQueueState.mockResolvedValue([
        {
          id: 'recover',
          file: fileA,
          status: 'encoding',
          progress: 45,
          attempts: 1,
          maxRetries: 2,
          overrides: { videoCodec: 'libvpx-vp9', crf: 60, volumeDb: 1.5 }
        }
      ])
    })
    const { result } = renderHook(() => useQueueManager(undefined))
    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    expect(result.current.queuedJobs[0]).toEqual(
      expect.objectContaining({
        status: 'pending',
        progress: 0,
        overrides: { videoCodec: 'libvpx-vp9', crf: 60, volumeDb: 1.5 }
      })
    )
  })

  test('does not checkpoint progress or metadata changes', () => {
    const job: QueuedJob = {
      id: 'one',
      file: fileA,
      status: 'encoding',
      progress: 10,
      attempts: 1,
      maxRetries: 2
    }
    expect(durableQueueChanged([job], [{ ...job, progress: 20, mediaInfo }])).toBe(false)
    expect(durableQueueChanged([job], [{ ...job, status: 'complete', progress: 100 }])).toBe(true)
  })
  test('enqueues unique files, opens queue, selects new jobs, and probes media info', async () => {
    mockWindowApi()
    ;(window.api.probeFile as jest.Mock)
      .mockResolvedValueOnce(mediaInfo)
      .mockRejectedValueOnce(new Error('probe failed'))

    const { result } = renderHook(() => useQueueManager('/ffmpeg/bin/ffmpeg'))

    await act(async () => {
      result.current.enqueueFiles([fileA, fileB])
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.queuedJobs).toHaveLength(2)
      expect(result.current.selectedJobIds).toHaveLength(2)
      expect(result.current.isQueueOpen).toBe(true)
    })

    await waitFor(() => {
      expect(result.current.queuedJobs[0].mediaInfo).toEqual(mediaInfo)
      expect(result.current.queuedJobs[1].mediaInfoError).toBe(true)
    })

    await act(async () => {
      result.current.enqueueFiles([fileA, fileC])
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.queuedJobs).toHaveLength(3)
    })

    expect((window.api.probeFile as jest.Mock).mock.calls.map((args) => args[0])).toEqual([
      fileA.path,
      fileB.path,
      fileC.path
    ])
  })

  test('saves and loads queue data through window api', async () => {
    mockWindowApi((api) => {
      api.readTextFile.mockResolvedValue(
        JSON.stringify([
          {
            id: 'loaded-1',
            file: fileA,
            status: 'encoding',
            progress: 88,
            attempts: 7,
            maxRetries: 20,
            mediaInfo: { stale: true }
          },
          {
            id: 'duplicate-path',
            file: fileA,
            status: 'pending',
            progress: 0,
            attempts: 0,
            maxRetries: 2
          },
          {
            id: 'invalid-file',
            file: { name: '', path: '' }
          }
        ])
      )
    })

    const { result } = renderHook(() => useQueueManager(undefined))

    const jobsToSave: QueuedJob[] = [
      {
        id: 'save-1',
        file: fileB,
        status: 'pending',
        progress: 0,
        attempts: 0,
        maxRetries: 2
      }
    ]

    await act(async () => {
      await result.current.handleSaveQueue(jobsToSave)
    })

    expect(window.api.saveTextFile).toHaveBeenCalledWith(
      JSON.stringify(jobsToSave, null, 2),
      'queue.json'
    )

    await act(async () => {
      await result.current.handleLoadQueue()
    })

    expect(result.current.queuedJobs).toHaveLength(1)
    expect(result.current.queuedJobs[0].id).toBe('loaded-1')
    expect(result.current.queuedJobs[0]).toMatchObject({
      status: 'pending',
      progress: 0,
      attempts: 0,
      maxRetries: 10
    })
    expect(result.current.selectedJobIds).toEqual(['loaded-1'])
    expect(result.current.isQueueOpen).toBe(true)
  })

  test('updates per-job overrides and retries and removes selected jobs', async () => {
    mockWindowApi()
    ;(window.api.probeFile as jest.Mock).mockResolvedValue(mediaInfo)

    const { result } = renderHook(() => useQueueManager(undefined))

    await act(async () => {
      result.current.enqueueFiles([fileA])
      await Promise.resolve()
    })

    const jobId = result.current.queuedJobs[0].id

    act(() => {
      result.current.handleUpdateJobOverrides(
        jobId,
        { videoCodec: 'libx264', audioCodec: 'copy' },
        5
      )
    })

    expect(result.current.queuedJobs[0].overrides).toEqual({
      videoCodec: 'libx264',
      audioCodec: 'copy'
    })
    expect(result.current.queuedJobs[0].maxRetries).toBe(5)

    act(() => {
      result.current.handleFileSelect(jobId)
    })
    expect(result.current.selectedJobIds).toEqual([])

    act(() => {
      result.current.handleSelectAll()
    })
    expect(result.current.selectedJobIds).toEqual([jobId])

    act(() => {
      result.current.handleClearSelection()
      result.current.handleRemoveJobs([jobId])
    })

    expect(result.current.queuedJobs).toEqual([])
    expect(result.current.selectedJobIds).toEqual([])
  })
})

test('assigns unique job IDs when an imported queue repeats an ID', async () => {
  mockWindowApi((api) => {
    api.readTextFile.mockResolvedValue(
      JSON.stringify([
        { id: 'repeated', file: { name: 'first.mp4', path: '/first.mp4', size: 1, modified: 1 } },
        { id: 'repeated', file: { name: 'second.mp4', path: '/second.mp4', size: 1, modified: 1 } }
      ])
    )
  })
  const { result } = renderHook(() => useQueueManager(undefined))
  await act(async () => {
    await result.current.handleLoadQueue()
  })
  expect(result.current.queuedJobs).toHaveLength(2)
  expect(new Set(result.current.queuedJobs.map((job) => job.id)).size).toBe(2)
})

test('filtered selection preserves files outside the filter', async () => {
  const { result } = renderHook(() => useQueueManager(undefined))
  await act(async () => {
    result.current.enqueueFiles([fileA, fileB, fileC])
  })
  const [first, second, third] = result.current.queuedJobs.map((job) => job.id)
  act(() => {
    result.current.handleClearSelection([second])
  })
  expect(result.current.selectedJobIds).toEqual([first, third])
  act(() => {
    result.current.handleSelectAll([second])
  })
  expect(new Set(result.current.selectedJobIds)).toEqual(new Set([first, second, third]))
})

test('duplicate imports give feedback and reopen the existing queue', async () => {
  const { result } = renderHook(() => useQueueManager(undefined))
  await act(async () => {
    result.current.enqueueFiles([fileA])
  })
  act(() => {
    result.current.setIsQueueOpen(false)
  })
  act(() => {
    result.current.enqueueFiles([fileA])
  })
  expect(result.current.queuedJobs).toHaveLength(1)
  expect(result.current.isQueueOpen).toBe(true)
  expect(result.current.queueFeedback?.message).toContain('already in the queue')
})

test.each(['invalid JSON', '{}', '[]'])(
  'invalid queue %s explains the problem and preserves existing files',
  async (content) => {
    mockWindowApi((api) => {
      api.readTextFile.mockResolvedValue(content)
    })
    const { result } = renderHook(() => useQueueManager(undefined))
    await act(async () => {
      result.current.enqueueFiles([fileA])
    })
    await act(async () => {
      await result.current.handleLoadQueue()
    })
    expect(result.current.queuedJobs[0].file).toEqual(fileA)
    expect(result.current.queueFeedback?.isError).toBe(true)
  }
)

test('canceling save shows no success and save failures remain visible', async () => {
  const api = mockWindowApi((mock) => {
    mock.saveTextFile.mockResolvedValue(false)
  })
  const { result } = renderHook(() => useQueueManager(undefined))
  await act(async () => {
    await result.current.handleSaveQueue([])
  })
  expect(result.current.queueFeedback).toBeNull()
  api.saveTextFile.mockRejectedValue(new Error('Permission denied'))
  await act(async () => {
    await result.current.handleSaveQueue([])
  })
  expect(result.current.queueFeedback).toEqual({ message: 'Permission denied', isError: true })
})

test('Undo restores removed files in order and preserves their previous selection', async () => {
  const { result } = renderHook(() => useQueueManager(undefined))
  await act(async () => {
    result.current.enqueueFiles([fileA, fileB, fileC])
  })
  const ids = result.current.queuedJobs.map((job) => job.id)
  act(() => {
    result.current.handleClearSelection([ids[2]])
  })
  act(() => {
    result.current.handleRemoveJobs([ids[0], ids[2]])
  })
  expect(result.current.removedCount).toBe(2)
  act(() => {
    result.current.handleUndoRemove()
  })
  expect(result.current.queuedJobs.map((job) => job.file)).toEqual([fileA, fileB, fileC])
  expect(new Set(result.current.selectedJobIds)).toEqual(new Set([ids[0], ids[1]]))
  expect(result.current.removedCount).toBe(0)
})

test('Undo does not duplicate a removed video that was added again', async () => {
  const { result } = renderHook(() => useQueueManager(undefined))
  await act(async () => {
    result.current.enqueueFiles([fileA])
  })
  act(() => {
    result.current.handleRemoveJobs([result.current.queuedJobs[0].id])
  })
  await act(async () => {
    result.current.enqueueFiles([fileA])
  })
  act(() => {
    result.current.handleUndoRemove()
  })
  expect(result.current.queuedJobs).toHaveLength(1)
})

test('queue import exposes loading state and prevents overlapping imports', async () => {
  let finish!: (content: string | null) => void
  const api = mockWindowApi((mock) => {
    mock.readTextFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
  })
  const { result } = renderHook(() => useQueueManager(undefined))
  act(() => {
    void result.current.handleLoadQueue()
  })
  expect(result.current.isLoadingQueue).toBe(true)
  await act(async () => {
    await result.current.handleLoadQueue()
  })
  expect(api.readTextFile).toHaveBeenCalledTimes(1)
  await act(async () => {
    finish(null)
  })
  expect(result.current.isLoadingQueue).toBe(false)
})
