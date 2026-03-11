import { useState, useRef, useEffect, type Dispatch, type SetStateAction } from 'react'
import type { QueuedJob, EncodingOptions, PatternTokens } from '../types'
import { buildFilenameFromPattern } from '../utils/pattern'
import type { EncodingConfig } from './useEncodingConfig'

interface SessionDeps {
  queuedJobs: QueuedJob[]
  setQueuedJobs: Dispatch<SetStateAction<QueuedJob[]>>
  selectedJobIds: string[]
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

  const isEncodingRef = useRef(false)
  const shouldSkipRef = useRef(false)

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
      logDirectory
    } = config

    const jobsToRun = queuedJobs.filter(
      (job) =>
        selectedJobIds.includes(job.id) && (job.status === 'pending' || job.status === 'error')
    )
    if (jobsToRun.length === 0) return

    isEncodingRef.current = true
    shouldSkipRef.current = false
    setIsEncoding(true)
    setQueueStartTime(Date.now())
    setEncodingError(null)
    setEncodingLogs(['Starting encoding process...'])
    setTotalQueueSize(jobsToRun.length)

    // Reset any jobs that got stuck in 'encoding' state
    setQueuedJobs((prev) =>
      prev.map((job) =>
        selectedJobIds.includes(job.id) && job.status === 'encoding'
          ? { ...job, status: 'pending', progress: 0 }
          : job
      )
    )

    const jobTimestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')

    const queue = [...jobsToRun]

    const runJobOnce = async (job: QueuedJob): Promise<void> => {
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
        logDirectory,
        jobTimestamp,
        twoPass: effectiveTwoPass,
        subtitleMode: effectiveSubtitleMode,
        videoBitrate: effectiveVideoBitrate,
        rateControlMode: effectiveRateControlMode,
        jobId: job.id
      }

      await new Promise<void>((resolve, reject) => {
        const removeComplete = window.api.onEncodingComplete(({ jobId, outputPath: completed }) => {
          if (jobId !== job.id) return
          cleanup()
          setEncodingLogs((prev) => [
            ...prev,
            `Completed: ${file.name}${completed ? ` -> ${completed}` : ''}`
          ])
          resolve()
        })
        const removeError = window.api.onEncodingError(({ jobId, error }) => {
          if (jobId !== job.id) return
          cleanup()
          reject(new Error(error))
        })

        const cleanup = (): void => {
          removeComplete()
          removeError()
        }

        if (shouldSkipRef.current) {
          shouldSkipRef.current = false
          resolve()
          return
        }

        window.api.startEncoding(options)
      })
    }

    const runWithRetries = async (job: QueuedJob): Promise<void> => {
      let attempt = job.attempts
      while (attempt <= job.maxRetries && isEncodingRef.current) {
        try {
          await runJobOnce(job)
          setQueuedJobs((prev) =>
            prev.map((item) =>
              item.id === job.id ? { ...item, status: 'complete', progress: 100 } : item
            )
          )
          return
        } catch (error) {
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
            setEncodingError(msg)
            throw error
          }
        }
      }
    }

    const runNext = async (): Promise<void> => {
      const next = queue.shift()
      if (!next || !isEncodingRef.current) return
      await runWithRetries(next)
      if (queue.length > 0 && isEncodingRef.current) {
        await runNext()
      }
    }

    const workers: Array<Promise<void>> = []
    for (let i = 0; i < Math.min(maxConcurrency, queue.length); i++) {
      workers.push(runNext())
    }

    try {
      await Promise.all(workers)
      setEncodingLogs((prev) => [...prev, '\nAll tasks finished.'])
    } catch {
      setEncodingLogs((prev) => [...prev, '\nQueue stopped due to error.'])
      isEncodingRef.current = false
    } finally {
      setIsEncoding(false)
      isEncodingRef.current = false
    }
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
    shouldSkipRef.current = true
    void window.api.cancelEncoding()
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
    handleStartEncoding,
    handleCancelEncoding,
    handleSkipCurrent
  }
}
