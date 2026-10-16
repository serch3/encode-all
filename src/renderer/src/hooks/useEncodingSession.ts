import { useState, useRef, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import type { QueuedJob, EncodingSummary } from '../types'
import type { EncodingCompletePayload, EncodingOptions } from '../../../preload/api.types'
import type { EncodingConfig } from './useEncodingConfig'
import { jobOutputPath, previewEncodingOptions } from '../utils/encodingOptions'

interface SessionDeps {
  queuedJobs: QueuedJob[]
  setQueuedJobs: Dispatch<SetStateAction<QueuedJob[]>>
  selectedJobIds: string[]
  setSelectedJobIds: Dispatch<SetStateAction<string[]>>
  maxConcurrency: number
  ffmpegPath: string | undefined
  config: EncodingConfig
  continueOnError?: boolean
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useEncodingSession({
  queuedJobs,
  setQueuedJobs,
  selectedJobIds,
  setSelectedJobIds,
  maxConcurrency,
  ffmpegPath,
  config,
  continueOnError = false
}: SessionDeps) {
  const [isEncoding, setIsEncoding] = useState(false)
  const [encodingLogs, setEncodingLogs] = useState<string[]>([])
  const [currentEncodingFile, setCurrentEncodingFile] = useState('')
  const [encodingError, setEncodingError] = useState<string | null>(null)
  const [queueStartTime, setQueueStartTime] = useState<number | null>(null)
  const [sessionJobIds, setSessionJobIds] = useState<string[]>([])
  const [eta, setEta] = useState('--')
  const [encodingSummary, setEncodingSummary] = useState<EncodingSummary | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const isEncodingRef = useRef(false)
  const paused = useRef(false)
  const resumeWaiters = useRef(new Set<() => void>())
  const skippedJobIdsRef = useRef(new Set<string>())
  const activeJobIdsRef = useRef(new Set<string>())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setQueuedJobs((prev) =>
      prev.map((job) =>
        job.status === 'encoding' ? { ...job, status: 'pending', progress: 0 } : job
      )
    )
    return () => {
      mounted.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const removeProgress = window.api.onEncodingProgress(({ jobId, progress }) => {
      if (!activeJobIdsRef.current.has(jobId)) return
      setQueuedJobs((prev) =>
        prev.map((job) =>
          job.id === jobId && job.progress !== progress
            ? { ...job, progress, status: 'encoding' }
            : job
        )
      )
    })
    const removeLog = window.api.onEncodingLog(({ jobId, log }) => {
      if (!activeJobIdsRef.current.has(jobId)) return
      setEncodingLogs((prev) => [...prev.slice(-499), log.slice(-8000)])
    })
    return () => {
      removeProgress()
      removeLog()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sessionIds = useMemo(() => new Set(sessionJobIds), [sessionJobIds])
  const selectedIds = useMemo(() => new Set(selectedJobIds), [selectedJobIds])
  const overallProgress = useMemo(() => {
    let total = 0
    let finished = 0
    for (const job of queuedJobs) {
      if (!sessionIds.has(job.id)) continue
      const weight = Math.max(1, Number(job.mediaInfo?.format.duration) || 60)
      total += weight
      if (['complete', 'error', 'canceled'].includes(job.status)) finished += weight
      else if (job.status === 'encoding') finished += (weight * job.progress) / 100
    }
    return total ? Math.min(100, (finished / total) * 100) : 0
  }, [queuedJobs, sessionIds])
  const encodingProgress = Math.round(overallProgress)

  useEffect(() => {
    void window.api.setBatchProgress(isEncoding ? overallProgress / 100 : -1).catch(console.warn)
  }, [isEncoding, overallProgress])

  useEffect(() => {
    if (
      !isEncoding ||
      !queueStartTime ||
      isPaused ||
      overallProgress <= 0 ||
      overallProgress >= 100
    ) {
      setEta('--')
      return
    }
    const update = (): void => {
      const remaining = Math.max(
        0,
        Math.round(((Date.now() - queueStartTime) * (100 / overallProgress - 1)) / 1000)
      )
      const hours = Math.floor(remaining / 3600)
      const minutes = Math.floor((remaining % 3600) / 60)
      const seconds = remaining % 60
      setEta(
        hours
          ? `${hours}h ${minutes}m ${seconds}s`
          : minutes
            ? `${minutes}m ${seconds}s`
            : `${seconds}s`
      )
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [isEncoding, queueStartTime, overallProgress, isPaused])

  const wakeWorkers = (): void => {
    paused.current = false
    setIsPaused(false)
    for (const resume of resumeWaiters.current) resume()
    resumeWaiters.current.clear()
  }
  const handlePauseEncoding = (): void => {
    if (paused.current) wakeWorkers()
    else {
      paused.current = true
      setIsPaused(true)
    }
  }

  const processQueue = async (
    reviewedOutputPaths?: Record<string, string>,
    reviewTokens?: Record<string, string | undefined>,
    reviewedSettings?: Record<string, EncodingOptions>
  ): Promise<void> => {
    const jobsToRun = queuedJobs.filter(
      (job) => selectedIds.has(job.id) && ['pending', 'error', 'canceled'].includes(job.status)
    )
    if (!jobsToRun.length) return
    const startedAt = Date.now()
    isEncodingRef.current = true
    skippedJobIdsRef.current.clear()
    activeJobIdsRef.current.clear()
    wakeWorkers()
    setIsEncoding(true)
    setQueueStartTime(startedAt)
    setEncodingError(null)
    setEncodingSummary(null)
    setEncodingLogs(['Starting encoding process...'])
    setSessionJobIds(jobsToRun.map((job) => job.id))
    setQueuedJobs((prev) =>
      prev.map((job) =>
        selectedIds.has(job.id) && job.status !== 'complete'
          ? { ...job, status: 'pending', progress: 0, error: undefined }
          : job
      )
    )
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
    const pending = [...jobsToRun]
    const completedIds = new Set<string>()
    const finalStates = new Map<string, QueuedJob>()
    let stoppedDueToError = false

    const runOnce = async (job: QueuedJob, attempt: number): Promise<EncodingCompletePayload> => {
      activeJobIdsRef.current.add(job.id)
      try {
        setQueuedJobs((prev) =>
          prev.map((item) =>
            item.id === job.id
              ? { ...item, status: 'encoding', progress: 0, attempts: attempt, error: undefined }
              : item
          )
        )
        setCurrentEncodingFile(job.file.name)
        setEncodingLogs((prev) => [...prev, `\nProcessing: ${job.file.name}`])
        const encoding =
          reviewedSettings?.[job.id] ?? previewEncodingOptions(job, config, ffmpegPath)
        const outputPath =
          reviewedOutputPaths?.[job.id] ?? (await jobOutputPath(job, config, encoding))
        if (!isEncodingRef.current || skippedJobIdsRef.current.has(job.id))
          throw new Error('Encoding canceled')
        return await new Promise<EncodingCompletePayload>((resolve, reject) => {
          let settled = false
          const removeComplete = window.api.onEncodingComplete((payload) => {
            if (payload.jobId === job.id) settle(() => resolve(payload))
          })
          const removeError = window.api.onEncodingError(({ jobId, error }) => {
            if (jobId === job.id) settle(() => reject(new Error(error)))
          })
          const settle = (callback: () => void): void => {
            if (settled) return
            settled = true
            removeComplete()
            removeError()
            callback()
          }
          void window.api
            .startEncoding({
              ...encoding,
              reviewToken: reviewTokens?.[job.id],
              outputPath,
              jobId: job.id,
              enableLogging: config.enableLogging,
              logDirectory: config.logDirectory,
              jobTimestamp: timestamp,
              sourceDurationSeconds:
                encoding.sourceDurationSeconds ||
                Number(job.mediaInfo?.format.duration) ||
                undefined
            })
            .catch((error) => settle(() => reject(error)))
        })
      } finally {
        activeJobIdsRef.current.delete(job.id)
      }
    }

    const runWithRetries = async (job: QueuedJob): Promise<void> => {
      for (let attempt = 1; attempt <= job.maxRetries + 1 && isEncodingRef.current; attempt++) {
        try {
          const result = await runOnce(job, attempt)
          const done: QueuedJob = {
            ...job,
            status: 'complete',
            progress: 100,
            attempts: attempt,
            error: undefined,
            outputPath: result.outputPath,
            outputSize: result.outputSize,
            elapsedMs: result.elapsedMs
          }
          completedIds.add(job.id)
          finalStates.set(job.id, done)
          setQueuedJobs((prev) => prev.map((item) => (item.id === job.id ? done : item)))
          setEncodingLogs((prev) => [
            ...prev,
            `Completed: ${job.file.name}${result.outputPath ? ` -> ${result.outputPath}` : ''}`
          ])
          return
        } catch (error) {
          if (skippedJobIdsRef.current.delete(job.id) || !isEncodingRef.current) {
            const canceled: QueuedJob = {
              ...job,
              status: 'canceled',
              progress: 0,
              attempts: attempt,
              error: undefined
            }
            finalStates.set(job.id, canceled)
            setQueuedJobs((prev) => prev.map((item) => (item.id === job.id ? canceled : item)))
            return
          }
          const message = error instanceof Error ? error.message : String(error)
          const retry = attempt <= job.maxRetries
          const failed: QueuedJob = {
            ...job,
            status: retry ? 'pending' : 'error',
            progress: 0,
            attempts: attempt,
            error: message
          }
          setQueuedJobs((prev) => prev.map((item) => (item.id === job.id ? failed : item)))
          setEncodingLogs((prev) => [
            ...prev,
            `Error encoding ${job.file.name}: ${message}${retry ? ' — retrying' : ''}`
          ])
          if (!retry) {
            finalStates.set(job.id, failed)
            setEncodingError(message)
            if (!continueOnError) {
              stoppedDueToError = true
              wakeWorkers()
            }
            return
          }
        }
      }
    }
    const worker = async (): Promise<void> => {
      while (pending.length && isEncodingRef.current && !stoppedDueToError) {
        if (paused.current) await new Promise<void>((resolve) => resumeWaiters.current.add(resolve))
        if (!isEncodingRef.current || stoppedDueToError) return
        const next = pending.shift()
        if (next) await runWithRetries(next)
      }
    }
    await Promise.allSettled(
      Array.from({ length: Math.min(maxConcurrency, pending.length) }, worker)
    )
    if (!mounted.current) return
    const summaryJobs = jobsToRun.map(
      (job) => finalStates.get(job.id) ?? { ...job, status: 'pending' as const, progress: 0 }
    )
    const successful = summaryJobs.filter((job) => job.status === 'complete').length
    const failed = summaryJobs.filter((job) => job.status === 'error').length
    const canceled = summaryJobs.filter((job) => job.status === 'canceled').length
    setEncodingSummary({
      jobs: summaryJobs,
      successful,
      failed,
      canceled,
      pending: summaryJobs.filter((job) => job.status === 'pending').length,
      startTime: startedAt,
      endTime: Date.now(),
      outputDirectory: config.outputDirectory || 'Input directories'
    })
    const finished = completedIds.size === jobsToRun.length
    if (finished) {
      setQueuedJobs((prev) => prev.filter((job) => !completedIds.has(job.id)))
      setSelectedJobIds((prev) => prev.filter((id) => !completedIds.has(id)))
    } else {
      const states = new Map(summaryJobs.map((job) => [job.id, job]))
      setQueuedJobs((prev) => prev.map((job) => states.get(job.id) ?? job))
    }
    setEncodingLogs((prev) => [
      ...prev,
      finished
        ? '\nAll tasks finished.'
        : stoppedDueToError
          ? '\nQueue stopped due to error.'
          : '\nQueue stopped.'
    ])
    setIsEncoding(false)
    isEncodingRef.current = false
    wakeWorkers()
    void window.api.notifyBatchComplete(successful, failed).catch(console.warn)
  }

  const handleStartEncoding = (
    paths?: Record<string, string>,
    tokens?: Record<string, string | undefined>,
    settings?: Record<string, EncodingOptions>
  ): void => {
    if (selectedJobIds.length && !isEncodingRef.current) void processQueue(paths, tokens, settings)
  }
  const handleCancelEncoding = async (): Promise<void> => {
    isEncodingRef.current = false
    wakeWorkers()
    setQueuedJobs((prev) =>
      prev.map((job) =>
        job.status === 'encoding' ? { ...job, status: 'canceled', progress: 0 } : job
      )
    )
    await window.api.cancelEncoding()
    setEncodingLogs((prev) => [...prev, 'Encoding cancelled by user.'])
  }
  const handleSkipCurrent = (id?: string): void => {
    const jobId =
      id ??
      [...activeJobIdsRef.current].at(-1) ??
      queuedJobs.find((job) => job.status === 'encoding')?.id
    if (!jobId) return
    skippedJobIdsRef.current.add(jobId)
    void window.api.cancelEncoding(jobId)
    setEncodingLogs((prev) => [...prev, 'Skipping current file...'])
  }
  return {
    isEncoding,
    isPaused,
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
    handleSkipCurrent,
    handlePauseEncoding
  }
}
