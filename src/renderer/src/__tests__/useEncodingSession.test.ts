import { act, renderHook, waitFor } from '@test-utils'
import { mockWindowApi } from '@test-utils'
import { useState } from 'react'
import { useEncodingSession } from '../hooks/useEncodingSession'
import type { QueuedJob } from '../types'

const baseConfig = {
  container: 'mkv',
  videoCodec: 'libx265',
  audioCodec: 'aac',
  audioChannels: 'same',
  audioBitrate: 128,
  volumeDb: 0,
  renamePattern: '{name}_{codec}',
  outputDirectory: '/out',
  threads: 0,
  trackSelection: 'auto',
  crf: 23,
  preset: 'medium',
  twoPass: false,
  subtitleMode: 'none',
  videoBitrate: 2500,
  rateControlMode: 'crf' as const,
  enableLogging: true,
  logDirectory: '/logs',
  savedProfiles: [],
  setContainer: jest.fn(),
  setVideoCodec: jest.fn(),
  setAudioCodec: jest.fn(),
  setAudioChannels: jest.fn(),
  setAudioBitrate: jest.fn(),
  setVolumeDb: jest.fn(),
  setRenamePattern: jest.fn(),
  setOutputDirectory: jest.fn(),
  setThreads: jest.fn(),
  setTrackSelection: jest.fn(),
  setCrf: jest.fn(),
  setPreset: jest.fn(),
  setTwoPass: jest.fn(),
  setSubtitleMode: jest.fn(),
  setVideoBitrate: jest.fn(),
  setRateControlMode: jest.fn(),
  setEnableLogging: jest.fn(),
  setLogDirectory: jest.fn(),
  setSavedProfiles: jest.fn()
}

const makeJob = (id: string, maxRetries = 1): QueuedJob => ({
  id,
  file: {
    name: `${id}.mp4`,
    path: `/videos/${id}.mp4`,
    size: 10,
    modified: 1
  },
  status: 'pending',
  progress: 0,
  attempts: 0,
  maxRetries
})

describe('useEncodingSession', () => {
  test('starts encoding and marks job complete after progress and completion events', async () => {
    let progressListener: ((payload: { jobId: string; progress: number }) => void) | undefined
    let completeListener: ((payload: { jobId: string; outputPath?: string }) => void) | undefined

    mockWindowApi((api) => {
      api.onEncodingProgress.mockImplementation((cb) => {
        progressListener = cb
        return () => {}
      })
      api.onEncodingComplete.mockImplementation((cb) => {
        completeListener = cb
        return () => {}
      })
      api.pathJoin.mockImplementation(async (dir, file) => `${dir}/${file}`)
      api.startEncoding.mockImplementation(async (options) => {
        progressListener?.({ jobId: options.jobId as string, progress: 35 })
        completeListener?.({ jobId: options.jobId as string, outputPath: '/out/done.mkv' })
      })
    })

    const { result } = renderHook(() => {
      const [jobs, setJobs] = useState<QueuedJob[]>([makeJob('job-1')])
      const [selectedJobIds, setSelectedJobIds] = useState<string[]>(['job-1'])
      const session = useEncodingSession({
        queuedJobs: jobs,
        setQueuedJobs: setJobs,
        selectedJobIds,
        setSelectedJobIds,
        maxConcurrency: 1,
        ffmpegPath: '/ffmpeg',
        config: baseConfig
      })
      return { jobs, session }
    })

    act(() => {
      result.current.session.handleStartEncoding()
    })

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(0)
    })

    expect(window.api.startEncoding).toHaveBeenCalledTimes(1)
    expect(window.api.startEncoding).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: '/videos/job-1.mp4',
        outputPath: '/out/job-1_x265.mkv',
        jobId: 'job-1'
      })
    )
    expect(result.current.session.currentEncodingFile).toBe('job-1.mp4')
    expect(result.current.session.encodingLogs.join('\n')).toContain('Completed: job-1.mp4')
  })

  test('retries a failed job and succeeds on second attempt', async () => {
    let completeListener: ((payload: { jobId: string; outputPath?: string }) => void) | undefined
    let errorListener: ((payload: { jobId: string; error: string }) => void) | undefined
    let attemptCount = 0

    mockWindowApi((api) => {
      api.onEncodingComplete.mockImplementation((cb) => {
        completeListener = cb
        return () => {}
      })
      api.onEncodingError.mockImplementation((cb) => {
        errorListener = cb
        return () => {}
      })
      api.startEncoding.mockImplementation(async (options) => {
        attemptCount += 1
        if (attemptCount === 1) {
          errorListener?.({ jobId: options.jobId as string, error: 'boom' })
          return
        }
        completeListener?.({ jobId: options.jobId as string, outputPath: '/out/retried.mkv' })
      })
    })

    const { result } = renderHook(() => {
      const [jobs, setJobs] = useState<QueuedJob[]>([makeJob('job-2', 2)])
      const [selectedJobIds, setSelectedJobIds] = useState<string[]>(['job-2'])
      const session = useEncodingSession({
        queuedJobs: jobs,
        setQueuedJobs: setJobs,
        selectedJobIds,
        setSelectedJobIds,
        maxConcurrency: 1,
        ffmpegPath: '/ffmpeg',
        config: baseConfig
      })
      return { jobs, session }
    })

    act(() => {
      result.current.session.handleStartEncoding()
    })

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(0)
    })

    expect(window.api.startEncoding).toHaveBeenCalledTimes(2)
    expect(result.current.session.encodingLogs.join('\n')).toContain('retrying')
  })

  test('selected error jobs can be started again even with exhausted previous attempts', async () => {
    let completeListener: ((payload: { jobId: string; outputPath?: string }) => void) | undefined

    mockWindowApi((api) => {
      api.onEncodingComplete.mockImplementation((cb) => {
        completeListener = cb
        return () => {}
      })
      api.startEncoding.mockImplementation(async (options) => {
        completeListener?.({ jobId: options.jobId as string, outputPath: '/out/restarted.mkv' })
      })
    })

    const { result } = renderHook(() => {
      const [jobs, setJobs] = useState<QueuedJob[]>([
        {
          ...makeJob('job-err', 2),
          status: 'error',
          attempts: 3,
          error: 'previous failure'
        }
      ])
      const [selectedJobIds, setSelectedJobIds] = useState<string[]>(['job-err'])
      const session = useEncodingSession({
        queuedJobs: jobs,
        setQueuedJobs: setJobs,
        selectedJobIds,
        setSelectedJobIds,
        maxConcurrency: 1,
        ffmpegPath: '/ffmpeg',
        config: baseConfig
      })
      return { jobs, session }
    })

    act(() => {
      result.current.session.handleStartEncoding()
    })

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(0)
    })

    expect(window.api.startEncoding).toHaveBeenCalledTimes(1)
    expect(result.current.session.encodingLogs.join('\n')).toContain('Completed: job-err.mp4')
  })

  test('marks a job failed when the start-encoding invoke rejects', async () => {
    mockWindowApi((api) => {
      api.startEncoding.mockRejectedValue(new Error('invoke failed'))
    })

    const { result } = renderHook(() => {
      const [jobs, setJobs] = useState<QueuedJob[]>([makeJob('job-reject', 0)])
      const [selectedJobIds, setSelectedJobIds] = useState<string[]>(['job-reject'])
      const session = useEncodingSession({
        queuedJobs: jobs,
        setQueuedJobs: setJobs,
        selectedJobIds,
        setSelectedJobIds,
        maxConcurrency: 1,
        ffmpegPath: '/ffmpeg',
        config: baseConfig
      })
      return { jobs, session }
    })

    act(() => {
      result.current.session.handleStartEncoding()
    })

    await waitFor(() => {
      expect(result.current.jobs[0].status).toBe('error')
    })

    expect(window.api.startEncoding).toHaveBeenCalledTimes(1)
    expect(result.current.jobs[0].error).toBe('invoke failed')
    expect(result.current.session.encodingLogs.join('\n')).toContain('Queue stopped due to error.')
  })

  test('records encoding summary with the local queue start and end timestamps', async () => {
    let completeListener: ((payload: { jobId: string; outputPath?: string }) => void) | undefined
    let now = 1000
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now)

    try {
      mockWindowApi((api) => {
        api.onEncodingComplete.mockImplementation((cb) => {
          completeListener = cb
          return () => {}
        })
        api.startEncoding.mockImplementation(async (options) => {
          now = 4500
          completeListener?.({ jobId: options.jobId as string, outputPath: '/out/summary.mkv' })
        })
      })

      const { result } = renderHook(() => {
        const [jobs, setJobs] = useState<QueuedJob[]>([makeJob('job-summary')])
        const [selectedJobIds, setSelectedJobIds] = useState<string[]>(['job-summary'])
        const session = useEncodingSession({
          queuedJobs: jobs,
          setQueuedJobs: setJobs,
          selectedJobIds,
          setSelectedJobIds,
          maxConcurrency: 1,
          ffmpegPath: '/ffmpeg',
          config: baseConfig
        })
        return { jobs, session }
      })

      act(() => {
        result.current.session.handleStartEncoding()
      })

      await waitFor(() => {
        expect(result.current.session.encodingSummary).toEqual(
          expect.objectContaining({
            successful: 1,
            failed: 0,
            canceled: 0,
            startTime: 1000,
            endTime: 4500
          })
        )
      })

      expect(result.current.jobs).toHaveLength(0)
      expect(result.current.session.encodingSummary?.jobs[0].status).toBe('complete')
    } finally {
      nowSpy.mockRestore()
    }
  })

  test('waits for in-flight concurrent jobs before summarizing after a failure', async () => {
    const completeListeners: Array<(payload: { jobId: string; outputPath?: string }) => void> = []
    const errorListeners: Array<(payload: { jobId: string; error: string }) => void> = []
    let releaseSlowJob: (() => void) | undefined

    mockWindowApi((api) => {
      api.onEncodingComplete.mockImplementation((cb) => {
        completeListeners.push(cb)
        return () => {
          const index = completeListeners.indexOf(cb)
          if (index >= 0) completeListeners.splice(index, 1)
        }
      })
      api.onEncodingError.mockImplementation((cb) => {
        errorListeners.push(cb)
        return () => {
          const index = errorListeners.indexOf(cb)
          if (index >= 0) errorListeners.splice(index, 1)
        }
      })
      api.startEncoding.mockImplementation(async (options) => {
        if (options.jobId === 'job-fail') {
          void Promise.resolve().then(() => {
            errorListeners.forEach((listener) =>
              listener({ jobId: 'job-fail', error: 'first job failed' })
            )
          })
          return
        }

        releaseSlowJob = () => {
          completeListeners.forEach((listener) =>
            listener({ jobId: 'job-slow', outputPath: '/out/job-slow.mkv' })
          )
        }
      })
    })

    const { result } = renderHook(() => {
      const [jobs, setJobs] = useState<QueuedJob[]>([makeJob('job-slow'), makeJob('job-fail', 0)])
      const [selectedJobIds, setSelectedJobIds] = useState<string[]>(['job-slow', 'job-fail'])
      const session = useEncodingSession({
        queuedJobs: jobs,
        setQueuedJobs: setJobs,
        selectedJobIds,
        setSelectedJobIds,
        maxConcurrency: 2,
        ffmpegPath: '/ffmpeg',
        config: baseConfig
      })
      return { jobs, session }
    })

    act(() => {
      result.current.session.handleStartEncoding()
    })

    await waitFor(() => {
      expect(window.api.startEncoding).toHaveBeenCalledTimes(2)
      expect(releaseSlowJob).toBeDefined()
    })

    expect(result.current.session.encodingSummary).toBeNull()

    act(() => {
      releaseSlowJob?.()
    })

    await waitFor(() => {
      expect(result.current.session.encodingSummary).toEqual(
        expect.objectContaining({
          successful: 1,
          failed: 1,
          canceled: 0
        })
      )
    })

    expect(result.current.jobs.map((job) => [job.id, job.status])).toEqual([
      ['job-slow', 'complete'],
      ['job-fail', 'error']
    ])
    expect(result.current.session.encodingLogs.join('\n')).toContain('Queue stopped due to error.')
  })

  test('cancel and skip controls call cancel api and update session logs', async () => {
    mockWindowApi()

    const { result } = renderHook(() => {
      const [jobs, setJobs] = useState<QueuedJob[]>([
        { ...makeJob('job-3'), status: 'encoding', progress: 40 }
      ])
      const [selectedJobIds, setSelectedJobIds] = useState<string[]>(['job-3'])
      const session = useEncodingSession({
        queuedJobs: jobs,
        setQueuedJobs: setJobs,
        selectedJobIds,
        setSelectedJobIds,
        maxConcurrency: 1,
        ffmpegPath: '/ffmpeg',
        config: baseConfig
      })
      return { jobs, setJobs, session }
    })

    act(() => {
      result.current.setJobs((prev) =>
        prev.map((job) => ({ ...job, status: 'encoding', progress: 40 }))
      )
    })

    act(() => {
      result.current.session.handleSkipCurrent()
    })

    expect(window.api.cancelEncoding).toHaveBeenCalledWith('job-3')
    expect(result.current.session.encodingLogs.join('\n')).toContain('Skipping current file...')

    await act(async () => {
      await result.current.session.handleCancelEncoding()
    })

    expect(window.api.cancelEncoding).toHaveBeenCalledTimes(2)
    expect(result.current.jobs[0].status).toBe('canceled')
    expect(result.current.jobs[0].progress).toBe(0)
    expect(result.current.session.encodingLogs.join('\n')).toContain('Encoding cancelled by user.')
  })
})
