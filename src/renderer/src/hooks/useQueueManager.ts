import { useState } from 'react'
import { useLocalStorage } from './useLocalStorage'
import type { QueuedJob, VideoFile, EncodingOptions } from '../types'

/**
 * Manages the encoding queue: job list, selection state, file probing,
 * and queue persistence (save / load).
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useQueueManager(ffmpegPath: string | undefined) {
  const [queuedJobs, setQueuedJobs] = useLocalStorage<QueuedJob[]>('queue-state', [])
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([])
  const [maxRetries, setMaxRetries] = useLocalStorage<number>('queue-max-retries', 2)
  const [maxConcurrency, setMaxConcurrency] = useLocalStorage<number>('queue-max-concurrency', 1)
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false)

  const probeNewJobs = async (newJobs: QueuedJob[]): Promise<void> => {
    const PROBE_CONCURRENCY = 8
    let index = 0
    const runWorker = async (): Promise<void> => {
      while (index < newJobs.length) {
        const job = newJobs[index++]
        try {
          const info = await window.api.probeFile(job.file.path, ffmpegPath)
          setQueuedJobs((prev) =>
            prev.map((j) => (j.id === job.id ? { ...j, mediaInfo: info } : j))
          )
        } catch {
          setQueuedJobs((prev) =>
            prev.map((j) => (j.id === job.id ? { ...j, mediaInfoError: true } : j))
          )
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(PROBE_CONCURRENCY, newJobs.length) }, runWorker)
    )
  }

  const enqueueFiles = (files: VideoFile[]): void => {
    if (files.length === 0) return
    const existingPaths = new Set(queuedJobs.map((j) => j.file.path))
    const newJobs: QueuedJob[] = files
      .filter((f) => !existingPaths.has(f.path))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: 'pending' as const,
        progress: 0,
        attempts: 0,
        maxRetries,
        overrides: undefined
      }))
    if (newJobs.length === 0) return
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

  const handleSelectAll = (): void => {
    setSelectedJobIds(queuedJobs.map((j) => j.id))
  }

  const handleClearSelection = (): void => {
    setSelectedJobIds([])
  }

  const handleRemoveJobs = (jobIdsToRemove: string[]): void => {
    setQueuedJobs((prev) => prev.filter((job) => !jobIdsToRemove.includes(job.id)))
    setSelectedJobIds((prev) => prev.filter((id) => !jobIdsToRemove.includes(id)))
  }

  const handleSaveQueue = async (jobsToSave: QueuedJob[]): Promise<void> => {
    try {
      const content = JSON.stringify(jobsToSave, null, 2)
      await window.api.saveTextFile(content, 'queue.json')
    } catch (error) {
      console.error('Failed to save queue', error)
    }
  }

  const handleLoadQueue = async (): Promise<void> => {
    try {
      const content = await window.api.readTextFile()
      if (content) {
        const loaded = JSON.parse(content) as QueuedJob[]
        if (Array.isArray(loaded)) {
          setQueuedJobs(loaded)
          setSelectedJobIds(loaded.map((j) => j.id))
          setIsQueueOpen(true)
        }
      }
    } catch (error) {
      console.error('Failed to load queue', error)
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
              maxRetries: perJobRetries !== undefined ? perJobRetries : job.maxRetries
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
    maxConcurrency,
    setMaxConcurrency,
    isQueueOpen,
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
