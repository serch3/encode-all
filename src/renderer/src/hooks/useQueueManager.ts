import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useLocalStorage } from './useLocalStorage'
import type { QueuedJob, VideoFile, EncodingOptions } from '../types'
import { MAX_QUEUE_CONCURRENCY, MAX_QUEUE_RETRIES } from '../constants/queue'
import { maxQualityFor } from '../../../shared/encoders'
import { filePathKey } from '../../../shared/filePaths'

export interface QueueFeedback {
  message: string
  isError: boolean
}

/**
 * Manages the encoding queue: job list, selection state, file probing,
 * and queue persistence (save / load).
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useQueueManager(ffmpegPath: string | undefined) {
  const platform = window.electron?.process.platform ?? 'unknown'
  const [queuedJobs, setQueuedJobs] = useState<QueuedJob[]>(() => {
    try {
      return restoreQueue(JSON.parse(localStorage.getItem('queue-state') ?? '[]'))
    } catch {
      return []
    }
  })
  const [isRestoring, setIsRestoring] = useState(true)
  const [storageError, setStorageError] = useState<string | null>(null)
  const lastSaved = useRef(queuedJobs)
  const restoredIds = useRef(new Set<string>())
  const lastProbePath = useRef(ffmpegPath)
  const latestJobs = useRef(queuedJobs)
  latestJobs.current = queuedJobs
  const changedBeforeRestore = useRef(false)
  if (durableQueueChanged(lastSaved.current, queuedJobs)) changedBeforeRestore.current = true
  useEffect(() => {
    restoredIds.current = new Set(latestJobs.current.map((job) => job.id))
    let current = true
    void window.api
      .loadQueueState()
      .then((saved) => {
        if (!current) return
        if (saved !== null && saved !== undefined) {
          if (!Array.isArray(saved)) throw new Error('The saved queue has an invalid format.')
          const restored = restoreQueue(saved)
          if (saved.length && !restored.length)
            throw new Error('The saved queue contains no readable jobs.')
          restoredIds.current = new Set(restored.map((job) => job.id))
          if (!changedBeforeRestore.current) {
            lastSaved.current = restored
            setQueuedJobs(restored)
          } else {
            setQueuedJobs((existing) => {
              const paths = new Set(existing.map((job) => filePathKey(job.file.path, platform)))
              return [
                ...restored.filter((job) => !paths.has(filePathKey(job.file.path, platform))),
                ...existing
              ]
            })
          }
        }
      })
      .catch((error) => {
        if (current)
          setStorageError(
            error instanceof Error ? error.message : 'Could not restore the saved queue.'
          )
      })
      .finally(() => {
        if (current) setIsRestoring(false)
      })
    return () => {
      current = false
    }
  }, [platform])
  useEffect(() => {
    if (isRestoring || !durableQueueChanged(lastSaved.current, queuedJobs)) return
    lastSaved.current = queuedJobs
    // Progress and media metadata stay in memory. Save only durable job transitions.
    const snapshot = queuedJobs.map((job) => ({
      id: job.id,
      file: job.file,
      status: job.status,
      progress: 0,
      attempts: job.attempts,
      maxRetries: job.maxRetries,
      error: job.error,
      overrides: job.overrides,
      outputPath: job.outputPath,
      outputSize: job.outputSize,
      elapsedMs: job.elapsedMs
    }))
    void window.api
      .saveQueueState(snapshot)
      .then(() => {
        setStorageError(null)
        localStorage.removeItem('queue-state')
      })
      .catch((error) =>
        setStorageError(error instanceof Error ? error.message : 'Could not save the queue.')
      )
  }, [queuedJobs, isRestoring])
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([])
  const [continueOnError, setContinueOnError] = useLocalStorage<boolean>(
    'queue-continue-on-error',
    false
  )
  const [storedMaxRetries, setStoredMaxRetries] = useLocalStorage<number>('queue-max-retries', 2)
  const [storedMaxConcurrency, setStoredMaxConcurrency] = useLocalStorage<number>(
    'queue-max-concurrency',
    1
  )
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false)
  const [queueFeedback, setQueueFeedback] = useState<QueueFeedback | null>(null)
  const [isLoadingQueue, setIsLoadingQueue] = useState(false)
  const loadingQueue = useRef(false)
  const [removedJobs, setRemovedJobs] = useState<
    Array<{ job: QueuedJob; index: number; selected: boolean }>
  >([])
  const maxRetries = clampInteger(storedMaxRetries, 0, MAX_QUEUE_RETRIES)
  const maxConcurrency = clampInteger(storedMaxConcurrency, 1, MAX_QUEUE_CONCURRENCY)

  const setMaxRetries: Dispatch<SetStateAction<number>> = (value) => {
    setStoredMaxRetries((prev) =>
      clampInteger(resolveStateValue(value, prev), 0, MAX_QUEUE_RETRIES)
    )
  }

  const setMaxConcurrency: Dispatch<SetStateAction<number>> = (value) => {
    setStoredMaxConcurrency((prev) =>
      clampInteger(resolveStateValue(value, prev), 1, MAX_QUEUE_CONCURRENCY)
    )
  }

  const pendingProbes = useRef<Array<{ job: QueuedJob; path: string | undefined }>>([])
  const probing = useRef(new Set<string>())
  const activeProbes = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pendingProbes.current = []
    }
  }, [])
  const probeNewJobs = useCallback(
    (newJobs: QueuedJob[]): void => {
      for (const job of newJobs) {
        const key = `${job.id}:${ffmpegPath ?? ''}`
        if (probing.current.has(key)) continue
        probing.current.add(key)
        pendingProbes.current.push({ job, path: ffmpegPath })
      }
      const drain = (): void => {
        while (mounted.current && activeProbes.current < 4 && pendingProbes.current.length) {
          const work = pendingProbes.current.shift()!
          activeProbes.current += 1
          void window.api
            .probeFile(work.job.file.path, work.path)
            .then((info) => {
              if (mounted.current)
                setQueuedJobs((prev) =>
                  prev.map((job) =>
                    job.id === work.job.id
                      ? { ...job, mediaInfo: info, mediaInfoError: false }
                      : job
                  )
                )
            })
            .catch(() => {
              if (mounted.current)
                setQueuedJobs((prev) =>
                  prev.map((job) =>
                    job.id === work.job.id ? { ...job, mediaInfoError: true } : job
                  )
                )
            })
            .finally(() => {
              activeProbes.current -= 1
              probing.current.delete(`${work.job.id}:${work.path ?? ''}`)
              drain()
            })
        }
      }
      // Let the enqueue state update become visible before scheduling probes.
      queueMicrotask(drain)
    },
    [ffmpegPath]
  )
  useEffect(() => {
    if (isRestoring || !ffmpegPath) return
    const pathChanged = lastProbePath.current !== ffmpegPath
    lastProbePath.current = ffmpegPath
    probeNewJobs(
      latestJobs.current.filter(
        (job) =>
          (pathChanged || restoredIds.current.has(job.id)) && (!job.mediaInfo || job.mediaInfoError)
      )
    )
    restoredIds.current.clear()
  }, [ffmpegPath, isRestoring, probeNewJobs])
  const retryMediaInfo = (): void =>
    probeNewJobs(latestJobs.current.filter((job) => !job.mediaInfo || job.mediaInfoError))

  const enqueueFiles = (files: VideoFile[]): void => {
    if (files.length === 0) return
    const existingPaths = new Set(queuedJobs.map((j) => filePathKey(j.file.path, platform)))
    const newJobs: QueuedJob[] = files
      .filter((file) => {
        const key = filePathKey(file.path, platform)
        if (existingPaths.has(key)) return false
        existingPaths.add(key)
        return true
      })
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: 'pending' as const,
        progress: 0,
        attempts: 0,
        maxRetries,
        overrides: undefined
      }))
    if (newJobs.length === 0) {
      setQueueFeedback({ message: 'These videos are already in the queue.', isError: false })
      setIsQueueOpen(true)
      return
    }
    const skipped = files.length - newJobs.length
    setQueueFeedback({
      message: `Added ${newJobs.length} video${newJobs.length === 1 ? '' : 's'} to the queue.${skipped > 0 ? ` Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.` : ''}`,
      isError: false
    })
    setQueuedJobs((prev) => [...prev, ...newJobs])
    setSelectedJobIds((ids) => [...ids, ...newJobs.map((j) => j.id)])
    setIsQueueOpen(true)
    void probeNewJobs(newJobs)
  }

  const handleFileSelect = (jobId: string): void => {
    setSelectedJobIds((prev) => {
      const isAlreadySelected = prev.includes(jobId)
      return isAlreadySelected ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    })
  }

  const handleSelectAll = (jobIds?: string[]): void => {
    const ids = jobIds ?? queuedJobs.map((j) => j.id)
    setSelectedJobIds((prev) => [...new Set([...prev, ...ids])])
  }

  const handleClearSelection = (jobIds?: string[]): void => {
    setSelectedJobIds((prev) => (jobIds ? prev.filter((id) => !jobIds.includes(id)) : []))
  }

  const handleRemoveJobs = (jobIdsToRemove: string[]): void => {
    const removed = queuedJobs
      .map((job, index) => ({ job, index, selected: selectedJobIds.includes(job.id) }))
      .filter((item) => jobIdsToRemove.includes(item.job.id))
    if (removed.length === 0) return
    setRemovedJobs(removed)
    setQueuedJobs((prev) => prev.filter((job) => !jobIdsToRemove.includes(job.id)))
    setSelectedJobIds((prev) => prev.filter((id) => !jobIdsToRemove.includes(id)))
  }

  const handleUndoRemove = (): void => {
    const existing = new Set(queuedJobs.map((job) => filePathKey(job.file.path, platform)))
    const restored = removedJobs.filter(
      (item) =>
        !existing.has(filePathKey(item.job.file.path, platform)) &&
        !queuedJobs.some((job) => job.id === item.job.id)
    )
    const next = [...queuedJobs]
    for (const item of restored) next.splice(Math.min(item.index, next.length), 0, item.job)
    setQueuedJobs(next)
    setSelectedJobIds((ids) => [
      ...new Set([...ids, ...restored.filter((item) => item.selected).map((item) => item.job.id)])
    ])
    setRemovedJobs([])
    void probeNewJobs(
      restored.map((item) => item.job).filter((job) => !job.mediaInfo && !job.mediaInfoError)
    )
  }

  const handleSaveQueue = async (jobsToSave: QueuedJob[]): Promise<void> => {
    try {
      setQueueFeedback(null)
      const content = JSON.stringify(jobsToSave, null, 2)
      const saved = await window.api.saveTextFile(content, 'queue.json')
      if (saved) setQueueFeedback({ message: 'Queue saved.', isError: false })
    } catch (error) {
      setQueueFeedback({
        message: error instanceof Error ? error.message : 'Could not save the queue.',
        isError: true
      })
    }
  }

  const handleLoadQueue = async (): Promise<void> => {
    if (loadingQueue.current) return
    loadingQueue.current = true
    setIsLoadingQueue(true)
    try {
      setQueueFeedback(null)
      const content = await window.api.readTextFile()
      if (content) {
        const loaded = JSON.parse(content) as unknown
        if (Array.isArray(loaded)) {
          const seenPaths = new Set<string>()
          const seenIds = new Set<string>()
          const sanitized = loaded
            .map((item) => sanitizeLoadedJob(item, maxRetries))
            .filter((job): job is QueuedJob => {
              if (!job) return false
              const key = filePathKey(job.file.path, platform)
              if (seenPaths.has(key)) return false
              seenPaths.add(key)
              if (seenIds.has(job.id)) job.id = crypto.randomUUID()
              seenIds.add(job.id)
              return true
            })

          if (sanitized.length === 0) {
            setQueueFeedback({
              message: 'This queue contains no valid video files. Choose another queue file.',
              isError: true
            })
            return
          }

          setQueuedJobs(sanitized)
          setRemovedJobs([])
          setSelectedJobIds(sanitized.map((j) => j.id))
          setIsQueueOpen(true)
          setQueueFeedback({
            message: `Loaded ${sanitized.length} video${sanitized.length === 1 ? '' : 's'}.`,
            isError: false
          })
          void probeNewJobs(sanitized)
        } else {
          setQueueFeedback({
            message: 'This file is not a saved video queue. Choose a queue JSON file.',
            isError: true
          })
        }
      }
    } catch (error) {
      setQueueFeedback({
        message:
          error instanceof SyntaxError
            ? 'This queue file could not be read. Choose a valid queue JSON file.'
            : error instanceof Error
              ? error.message
              : 'Could not load the queue.',
        isError: true
      })
    } finally {
      loadingQueue.current = false
      setIsLoadingQueue(false)
    }
  }

  const handleUpdateJobOverrides = (
    jobId: string,
    overrides: Partial<EncodingOptions>,
    perJobRetries?: number
  ): void => {
    setQueuedJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? {
              ...job,
              overrides,
              maxRetries:
                perJobRetries !== undefined
                  ? clampInteger(perJobRetries, 0, MAX_QUEUE_RETRIES)
                  : job.maxRetries
            }
          : job
      )
    )
  }

  return {
    queuedJobs,
    setQueuedJobs,
    selectedJobIds,
    setSelectedJobIds,
    maxRetries,
    setMaxRetries,
    continueOnError,
    setContinueOnError,
    maxConcurrency,
    setMaxConcurrency,
    isQueueOpen,
    queueFeedback: storageError ? { message: storageError, isError: true } : queueFeedback,
    isRestoring,
    retryMediaInfo,
    isLoadingQueue,
    removedCount: removedJobs.length,
    handleUndoRemove,
    setIsQueueOpen,
    enqueueFiles,
    handleFileSelect,
    handleSelectAll,
    handleClearSelection,
    handleRemoveJobs,
    handleSaveQueue,
    handleLoadQueue,
    handleUpdateJobOverrides
  }
}

function resolveStateValue(value: SetStateAction<number>, previous: number): number {
  return typeof value === 'function' ? value(previous) : value
}

function clampInteger(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : min
  return Math.min(max, Math.max(min, numeric))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isVideoFile(value: unknown): value is VideoFile {
  if (!isRecord(value)) return false
  return (
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.path === 'string' &&
    value.path.length > 0 &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    typeof value.modified === 'number' &&
    Number.isFinite(value.modified)
  )
}

function sanitizeLoadedJob(value: unknown, fallbackRetries: number): QueuedJob | null {
  if (!isRecord(value) || !isVideoFile(value.file)) return null
  const loadedRetries =
    typeof value.maxRetries === 'number' && Number.isFinite(value.maxRetries)
      ? clampInteger(value.maxRetries, 0, MAX_QUEUE_RETRIES)
      : fallbackRetries

  return {
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : crypto.randomUUID(),
    file: value.file,
    status: 'pending',
    progress: 0,
    attempts: 0,
    maxRetries: loadedRetries,
    overrides: sanitizeOverrides(value.overrides)
  }
}

function sanitizeOverrides(value: unknown): Partial<EncodingOptions> | undefined {
  if (!isRecord(value)) return undefined

  const overrides: Partial<EncodingOptions> = {}
  type StringOverrideField =
    | 'container'
    | 'videoCodec'
    | 'audioCodec'
    | 'audioChannels'
    | 'preset'
    | 'trackSelection'
    | 'subtitleMode'

  const stringFields: StringOverrideField[] = [
    'container',
    'videoCodec',
    'audioCodec',
    'audioChannels',
    'preset',
    'trackSelection',
    'subtitleMode'
  ]

  for (const field of stringFields) {
    const fieldValue = value[field]
    if (typeof fieldValue === 'string' && fieldValue.length > 0) {
      overrides[field] = fieldValue
    }
  }

  if (value.rateControlMode === 'crf' || value.rateControlMode === 'bitrate') {
    overrides.rateControlMode = value.rateControlMode
  }

  if (typeof value.twoPass === 'boolean') {
    overrides.twoPass = value.twoPass
  }

  setNumberOverride(overrides, 'audioBitrate', value.audioBitrate, 0, 2000)
  setNumberOverride(overrides, 'volumeDb', value.volumeDb, -60, 60)
  setNumberOverride(
    overrides,
    'crf',
    value.crf,
    0,
    typeof value.videoCodec === 'string' ? maxQualityFor(value.videoCodec) : 63
  )
  setNumberOverride(overrides, 'threads', value.threads, 0, 64)
  setNumberOverride(overrides, 'videoBitrate', value.videoBitrate, 1, 1_000_000)
  if (value.pixelFormat === 'compatible' || value.pixelFormat === 'preserve')
    overrides.pixelFormat = value.pixelFormat
  if (
    typeof value.targetSizeMb === 'number' &&
    Number.isFinite(value.targetSizeMb) &&
    value.targetSizeMb >= 0 &&
    value.targetSizeMb <= 1000000
  )
    overrides.targetSizeMb = value.targetSizeMb
  for (const field of ['maxHeight', 'audioStreamIndex', 'subtitleStreamIndex'] as const) {
    if (
      typeof value[field] === 'number' &&
      Number.isInteger(value[field]) &&
      value[field] >= 0 &&
      value[field] <= 10000
    )
      overrides[field] = value[field]
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined
}

function setNumberOverride(
  overrides: Partial<EncodingOptions>,
  field: keyof Pick<
    EncodingOptions,
    'audioBitrate' | 'volumeDb' | 'crf' | 'threads' | 'videoBitrate'
  >,
  value: unknown,
  min: number,
  max: number
): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    overrides[field] =
      field === 'volumeDb' ? Math.min(max, Math.max(min, value)) : clampInteger(value, min, max)
  }
}

function restoreQueue(value: unknown): QueuedJob[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.flatMap((item) => {
    const job = sanitizeLoadedJob(item, 2)
    if (!job) return []
    if (ids.has(job.id)) job.id = crypto.randomUUID()
    ids.add(job.id)
    const original = item as QueuedJob
    return [
      {
        ...job,
        status: ['complete', 'error', 'canceled'].includes(original.status)
          ? original.status
          : 'pending',
        error: typeof original.error === 'string' ? original.error : undefined,
        outputPath: typeof original.outputPath === 'string' ? original.outputPath : undefined,
        outputSize: typeof original.outputSize === 'number' ? original.outputSize : undefined,
        elapsedMs: typeof original.elapsedMs === 'number' ? original.elapsedMs : undefined
      }
    ]
  })
}

export function durableQueueChanged(previous: QueuedJob[], next: QueuedJob[]): boolean {
  if (previous.length !== next.length) return true
  return next.some((job, index) => {
    const old = previous[index]
    return (
      old !== job &&
      (old.id !== job.id ||
        old.file !== job.file ||
        old.status !== job.status ||
        old.attempts !== job.attempts ||
        old.maxRetries !== job.maxRetries ||
        old.error !== job.error ||
        old.overrides !== job.overrides ||
        old.outputPath !== job.outputPath)
    )
  })
}
