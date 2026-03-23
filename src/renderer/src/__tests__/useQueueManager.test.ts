import { act, renderHook, waitFor } from '@test-utils'
import { mockWindowApi } from '@test-utils'
import { useQueueManager } from '../hooks/useQueueManager'
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
            status: 'pending',
            progress: 0,
            attempts: 0,
            maxRetries: 2
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