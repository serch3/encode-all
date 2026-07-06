import { useState, useRef, useEffect, type Dispatch, type SetStateAction } from 'react'
import type { QueuedJob, EncodingOptions, PatternTokens, EncodingSummary } from '../types'
import { buildFilenameFromPattern } from '../utils/pattern'
import type { EncodingConfig } from './useEncodingConfig'

interface SessionDeps {
  queuedJobs: QueuedJob[]
  setQueuedJobs: Dispatch<SetStateAction<QueuedJob[]>>
  selectedJobIds: string[]
  setSelectedJobIds: Dispatch<SetStateAction<string[]>>
  maxConcurrency: number
  ffmpegPath: string | undefined
  config: EncodingConfig
}

/**
 * Manages active encoding sessions: queue orchestration, concurrency workers,
 * retry logic, progress/log listeners, ETA calculation, and cancel/skip controls.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useEncodingSession({
  queuedJobs,
  setQueuedJobs,
  selectedJobIds,
  setSelectedJobIds,
  maxConcurrency,
  ffmpegPath,
  config
}: SessionDeps) {
  const [isEncoding, setIsEncoding] = useState<boolean>(false)
  const [encodingProgress, setEncodingProgress] = useState<number>(0)
  const [encodingLogs, setEncodingLogs] = useState<string[]>([])
  const [currentEncodingFile, setCurrentEncodingFile] = useState<string>('')
  const [encodingError, setEncodingError] = useState<string | null>(null)
  const [queueStartTime, setQueueStartTime] = useState<number | null>(null)
  const [totalQueueSize, setTotalQueueSize] = useState<number>(0)
  const [eta, setEta] = useState<string>('--')
  const [encodingSummary, setEncodingSummary] = useState<EncodingSummary | null>(null)

  const isEncodingRef = useRef(false)
  const skippedJobIdsRef = useRef<Set<string>>(new Set())
  const activeJobIdsRef = useRef<Set<string>>(new Set())

  // Reset any jobs that were mid-encoding when the app last closed
  useEffect(() => {
    setQueuedJobs((prev) =>
      prev.map((job) =>
        job.status === 'encoding' ? { ...job, status: 'pending', progress: 0 } : job
      )
    )
    // intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribe to per-job progress and log events from the main process
  useEffect(() => {
    const removeProgress = window.api.onEncodingProgress(({ jobId, progress }) => {
      setQueuedJobs((prev) =>
        prev.map((job) => (job.id === jobId ? { ...job, progress, status: 'encoding' } : job))
      )
    })
    const removeLog = window.api.onEncodingLog(({ log }) => {
      setEncodingLogs((prev) => {
        const next = [...prev, log]
        return next.length > 1000 ? next.slice(-1000) : next
      })
    })
    return () => {
      removeProgress()
      removeLog()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Derived: weighted progress across all selected jobs (0-100)
  const overallProgress =
    totalQueueSize > 0
      ? Math.min(
          100,
          (queuedJobs.reduce((acc, job) => {
            if (!selectedJobIds.includes(job.id)) return acc
            if (job.status === 'complete') return acc + 1
            if (job.status === 'encoding') return acc + job.progress / 100
            return acc
          }, 0) /
            totalQueueSize) *
            100
        )
      : 0

  useEffect(() => {
    if (isEncoding) {
      setEncodingProgress(Math.round(overallProgress))
    } else if (overallProgress === 0 || totalQueueSize === 0) {
      setEncodingProgress(0)
    }
  }, [overallProgress, isEncoding, totalQueueSize])

  // Recalculate ETA every second while encoding
  useEffect(() => {
    if (!isEncoding || !queueStartTime || overallProgress <= 0 || overallProgress >= 100) {
      if (!isEncoding) setEta('--')
      return
    }

    const formatDuration = (ms: number): string => {
      if (ms < 0) return '0s'
      const seconds = Math.floor((ms / 1000) % 60)
      const minutes = Math.floor((ms / (1000 * 60)) % 60)
      const hours = Math.floor(ms / (1000 * 60 * 60))
      if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
      if (minutes > 0) return `${minutes}m ${seconds}s`
      return `${seconds}s`
    }

    const updateEta = (): void => {
      const elapsed = Date.now() - queueStartTime
      const estimatedTotal = elapsed / (overallProgress / 100)
      setEta(formatDuration(estimatedTotal - elapsed))
    }

    updateEta()
    const interval = setInterval(updateEta, 1000)
    return () => clearInterval(interval)
  }, [isEncoding, queueStartTime, overallProgress])

  const processQueue = async (): Promise<void> => {
    const {
      container,
      videoCodec,
      audioCodec,
      audioChannels,
      audioBitrate,
      volumeDb,
      crf,
      preset,
      threads,
      trackSelection,
      twoPass,
      subtitleMode,
      videoBitrate,
      rateControlMode,
      renamePattern,
      outputDirectory,
      enableLogging,
      logDirectory
    } = config

    const jobsToRun = queuedJobs.filter(
      (job) =>
        selectedJobIds.includes(job.id) &&
        (job.status === 'pending' || job.status === 'error' || job.status === 'canceled')
    )
    if (jobsToRun.length === 0) return

    const startedAt = Date.now()
    isEncodingRef.current = true
    skippedJobIdsRef.current.clear()
    activeJobIdsRef.current.clear()
    setIsEncoding(true)
    setQueueStartTime(startedAt)
    setEncodingError(null)
    setEncodingSummary(null)
    setEncodingLogs(['Starting encoding process...'])
    setTotalQueueSize(jobsToRun.length)

    // Normalize selected jobs before a new run so previously failed/canceled
    // items can be retried immediately.
    setQueuedJobs((prev) =>
      prev.map((job) =>
        selectedJobIds.includes(job.id) &&
        (job.status === 'encoding' || job.status === 'error' || job.status === 'canceled')
          ? { ...job, status: 'pending', progress: 0, error: undefined }
          : job
      )
    )

    const jobTimestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')

    const queue = [...jobsToRun]
    const completedJobIds = new Set<string>()
    const finalJobStates = new Map<string, QueuedJob>()
    let stoppedDueToError = false

    const runJobOnce = async (job: QueuedJob): Promise<void> => {
      activeJobIdsRef.current.add(job.id)
      try {
        setQueuedJobs((prev) =>
          prev.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  status: 'encoding',
                  progress: 0,
                  attempts: item.attempts + 1,
                  error: undefined
                }
              : item
          )
        )

        const file = job.file
        setCurrentEncodingFile(file.name)
        setEncodingProgress(0)
        setEncodingLogs((prev) => [...prev, `\nProcessing: ${file.name}`])

        const effectiveContainer = job.overrides?.container ?? container
        const effectiveVideoCodec = job.overrides?.videoCodec ?? videoCodec
        const effectiveAudioCodec = job.overrides?.audioCodec ?? audioCodec
        const effectiveAudioChannels = job.overrides?.audioChannels ?? audioChannels
        const effectiveAudioBitrate = job.overrides?.audioBitrate ?? audioBitrate
        const effectiveVolumeDb = job.overrides?.volumeDb ?? volumeDb
        const effectiveCrf = job.overrides?.crf ?? crf
        const effectivePreset = job.overrides?.preset ?? preset
        const effectiveThreads = job.overrides?.threads ?? threads
        const effectiveTrackSelection = job.overrides?.trackSelection ?? trackSelection
        const effectiveTwoPass = job.overrides?.twoPass ?? twoPass
        const effectiveSubtitleMode = job.overrides?.subtitleMode ?? subtitleMode
        const effectiveVideoBitrate = job.overrides?.videoBitrate ?? videoBitrate
        const effectiveRateControlMode = job.overrides?.rateControlMode ?? rateControlMode

        const tokens: PatternTokens = {
          name: file.name.substring(0, file.name.lastIndexOf('.')),
          codec: effectiveVideoCodec.replace('lib', ''),
          ext: effectiveContainer
        }
        const outputFilename = buildFilenameFromPattern(renamePattern, tokens)
        const finalFilename = outputFilename
          .toLowerCase()
          .endsWith(`.${effectiveContainer.toLowerCase()}`)
          ? outputFilename
          : `${outputFilename}.${effectiveContainer}`

        let targetDir = outputDirectory
        if (!targetDir) {
          const lastSlash = Math.max(file.path.lastIndexOf('/'), file.path.lastIndexOf('\\'))
          targetDir = file.path.substring(0, lastSlash)
        }

        const outputPath = await window.api.pathJoin(targetDir, finalFilename)

        const options: EncodingOptions & { jobId: string } = {
          inputPath: file.path,
          outputPath,
          container: effectiveContainer,
          videoCodec: effectiveVideoCodec,
          audioCodec: effectiveAudioCodec,
          audioChannels: effectiveAudioChannels,
          audioBitrate: effectiveAudioBitrate,
          volumeDb: effectiveVolumeDb,
          crf: effectiveCrf,
          preset: effectivePreset,
          threads: effectiveThreads,
          trackSelection: effectiveTrackSelection,
          ffmpegPath,
          enableLogging,
          logDirectory,
          jobTimestamp,
          twoPass: effectiveTwoPass,
          subtitleMode: effectiveSubtitleMode,
          videoBitrate: effectiveVideoBitrate,
          rateControlMode: effectiveRateControlMode,
          jobId: job.id
        }

        await new Promise<void>((resolve, reject) => {
          let settled = false
          const removeComplete = window.api.onEncodingComplete(
            ({ jobId, outputPath: completed }) => {
              if (jobId !== job.id) return
              settle(() => {
                setEncodingLogs((prev) => [
                  ...prev,
                  `Completed: ${file.name}${completed ? ` -> ${completed}` : ''}`
                ])
                resolve()
              })
            }
          )
          const removeError = window.api.onEncodingError(({ jobId, error }) => {
            if (jobId !== job.id) return
            settle(() => reject(new Error(error)))
          })

          const cleanup = (): void => {
            removeComplete()
            removeError()
          }

          const settle = (callback: () => void): void => {
            if (settled) return
            settled = true
            cleanup()
            callback()
          }

          void window.api.startEncoding(options).catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            settle(() => reject(new Error(message)))
          })
        })
      } finally {
        activeJobIdsRef.current.delete(job.id)
      }
    }

    const runWithRetries = async (job: QueuedJob): Promise<void> => {
      // Retry budget is per queue run. Historical attempts should not block
      // manually re-running a previously failed item.
      let attempt = 0
      while (attempt <= job.maxRetries && isEncodingRef.current) {
        try {
          await runJobOnce(job)
          completedJobIds.add(job.id)
          const completedJob = { ...job, status: 'complete' as const, progress: 100 }
          finalJobStates.set(job.id, completedJob)
          setQueuedJobs((prev) => prev.map((item) => (item.id === job.id ? completedJob : item)))
          return
        } catch (error) {
          const wasSkipped = skippedJobIdsRef.current.delete(job.id)
          if (wasSkipped || !isEncodingRef.current) {
            const canceledJob = {
              ...job,
              status: 'canceled' as const,
              progress: 0,
              error: undefined
            }
            finalJobStates.set(job.id, canceledJob)
            setQueuedJobs((prev) => prev.map((item) => (item.id === job.id ? canceledJob : item)))
            return
          }
          const msg = error instanceof Error ? error.message : String(error)
          attempt += 1
          const hasAttemptsLeft = attempt <= job.maxRetries
          setQueuedJobs((prev) =>
            prev.map((item) =>
              item.id === job.id
                ? {
                    ...item,
                    status: hasAttemptsLeft ? 'pending' : 'error',
                    progress: 0,
                    attempts: attempt,
                    error: msg
                  }
                : item
            )
          )
          setEncodingLogs((prev) => [
            ...prev,
            `Error encoding ${job.file.name}: ${msg}${hasAttemptsLeft ? ' — retrying' : ''}`
          ])

          if (!hasAttemptsLeft) {
            stoppedDueToError = true
            finalJobStates.set(job.id, {
              ...job,
              status: 'error' as const,
              progress: 0,
              attempts: attempt,
              error: msg
            })
            setEncodingError(msg)
            throw error
          }
        }
      }
    }

    const runNext = async (): Promise<void> => {
      const next = queue.shift()
      if (!next || !isEncodingRef.current || stoppedDueToError) return
      await runWithRetries(next)
      if (queue.length > 0 && isEncodingRef.current && !stoppedDueToError) {
        await runNext()
      }
    }

    const workers: Array<Promise<void>> = []
    const workerCount = Math.min(maxConcurrency, queue.length)
    for (let i = 0; i < workerCount; i++) {
      workers.push(runNext())
    }

    const workerResults = await Promise.allSettled(workers)
    if (stoppedDueToError || workerResults.some((result) => result.status === 'rejected')) {
      setEncodingLogs((prev) => [...prev, '\nQueue stopped due to error.'])
    }

    const endTime = Date.now()

    const summaryJobs = jobsToRun.map((originalJob) => {
      if (finalJobStates.has(originalJob.id)) {
        return finalJobStates.get(originalJob.id)!
      }
      return { ...originalJob, status: 'canceled' as const, progress: 0 }
    })

    const successful = summaryJobs.filter((j) => j.status === 'complete').length
    const failed = summaryJobs.filter((j) => j.status === 'error').length
    const canceled = summaryJobs.filter((j) => j.status === 'canceled').length
    const completedAllJobs =
      !stoppedDueToError && isEncodingRef.current && completedJobIds.size === jobsToRun.length

    setEncodingSummary({
      jobs: summaryJobs,
      successful,
      failed,
      canceled,
      startTime: startedAt,
      endTime,
      outputDirectory: outputDirectory || 'Original Directory'
    })

    if (completedAllJobs) {
      setQueuedJobs((prev) => prev.filter((job) => !completedJobIds.has(job.id)))
      setSelectedJobIds((prev) => prev.filter((id) => !completedJobIds.has(id)))
    } else {
      const finalStates = new Map(summaryJobs.map((job) => [job.id, job]))
      setQueuedJobs((prev) => prev.map((job) => finalStates.get(job.id) ?? job))
    }

    if (completedAllJobs) {
      setEncodingLogs((prev) => [...prev, '\nAll tasks finished.'])
    } else if (!stoppedDueToError) {
      setEncodingLogs((prev) => [...prev, '\nQueue stopped.'])
    }
    setIsEncoding(false)
    isEncodingRef.current = false
  }

  const handleStartEncoding = (): void => {
    if (selectedJobIds.length === 0) return
    void processQueue()
  }

  const handleCancelEncoding = async (): Promise<void> => {
    isEncodingRef.current = false
    setIsEncoding(false)
    setQueuedJobs((prev) =>
      prev.map((job) =>
        job.status === 'encoding' ? { ...job, status: 'canceled', progress: 0 } : job
      )
    )
    await window.api.cancelEncoding()
    setEncodingLogs((prev) => [...prev, 'Encoding cancelled by user.'])
  }

  const handleSkipCurrent = (): void => {
    const activeJobIds =
      activeJobIdsRef.current.size > 0
        ? [...activeJobIdsRef.current]
        : queuedJobs.filter((job) => job.status === 'encoding').map((job) => job.id)

    for (const jobId of activeJobIds) {
      skippedJobIdsRef.current.add(jobId)
      void window.api.cancelEncoding(jobId)
    }
    setEncodingLogs((prev) => [...prev, 'Skipping current file...'])
  }

  return {
    isEncoding,
    encodingProgress,
    encodingLogs,
    currentEncodingFile,
    encodingError,
    setEncodingError,
    eta,
    overallProgress,
    encodingSummary,
    setEncodingSummary,
    handleStartEncoding,
    handleCancelEncoding,
    handleSkipCurrent
  }
}
