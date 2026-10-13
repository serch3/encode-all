import { useRef, useState } from 'react'
import type { BatchReviewEntry } from '../../../preload/api.types'
import type { QueuedJob } from '../types'
import type { EncodingConfig } from './useEncodingConfig'
import { jobOutputPath, previewEncodingOptions } from '../utils/encodingOptions'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useBatchReview(
  jobs: QueuedJob[],
  sourcePaths: string[],
  config: EncodingConfig,
  ffmpegPath?: string,
  supportedNvidiaEncoders?: string[]
) {
  const [isOpen, setIsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [entries, setEntries] = useState<BatchReviewEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const currentSignature = JSON.stringify({
    jobs: jobs.map((job) => ({ id: job.id, file: job.file, overrides: job.overrides })),
    sourcePaths,
    config,
    ffmpegPath,
    supportedNvidiaEncoders
  })
  const [reviewedSignature, setReviewedSignature] = useState('')
  const stale = entries.length > 0 && reviewedSignature !== currentSignature

  const close = (): void => {
    generation.current += 1
    setIsOpen(false)
    setBusy(false)
  }
  const review = async (): Promise<void> => {
    const token = ++generation.current
    setIsOpen(true)
    setBusy(true)
    setEntries([])
    setError(null)
    try {
      const planned = await Promise.all(
        jobs.map(async (job) => {
          const encoding = previewEncodingOptions(job, config, ffmpegPath)
          encoding.outputPath = await jobOutputPath(job, config, encoding)
          return { jobId: job.id, name: job.file.name, encoding }
        })
      )
      const result = await window.api.reviewBatchOutputs({
        jobs: planned,
        sourcePaths,
        supportedNvidiaEncoders
      })
      if (token !== generation.current) return
      setEntries(result)
      setReviewedSignature(currentSignature)
    } catch (cause) {
      if (token === generation.current)
        setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (token === generation.current) setBusy(false)
    }
  }
  const canStart =
    !busy &&
    !error &&
    !stale &&
    entries.length > 0 &&
    entries.every((entry) => entry.errors.length === 0)
  return { isOpen, busy, entries, error, stale, canStart, review, close }
}
