import { useEffect, useRef, useState } from 'react'
import type { QueuedJob } from '../types'
import type { PreviewResult } from '../../../preload/api.types'
import type { EncodingConfig } from './useEncodingConfig'
import { previewEncodingOptions } from '../utils/encodingOptions'
import { encodingIssues } from '../../../shared/encodingValidation'

interface Props {
  jobs: QueuedJob[]
  config: EncodingConfig
  ffmpegPath?: string
  ready: boolean
  checking?: boolean
  isEncoding: boolean
  supportedNvidiaEncoders?: string[]
}

// The controller lives with the app so navigating away does not discard a clip.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useVideoPreview({
  jobs,
  config,
  ffmpegPath,
  ready,
  checking = false,
  isEncoding,
  supportedNvidiaEncoders
}: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [start, setStart] = useState('0')
  const [duration, setDuration] = useState('10')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<
    (PreviewResult & { signature: string; name: string }) | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const running = useRef(false)
  const canceled = useRef(false)
  const resultId = useRef<string | null>(null)
  const job = jobs.find((item) => item.id === selectedId) ?? jobs[0]
  const encoding = job ? previewEncodingOptions(job, config, ffmpegPath) : null
  const signature = JSON.stringify({ encoding, start, duration })
  const sourceDuration = Number(job?.mediaInfo?.format.duration)
  const knownDuration =
    Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : undefined
  const startValid =
    start.trim() !== '' &&
    Number.isFinite(Number(start)) &&
    Number(start) >= 0 &&
    (knownDuration === undefined || Number(start) < knownDuration)
  const durationValid =
    duration.trim() !== '' &&
    Number.isFinite(Number(duration)) &&
    Number(duration) >= 1 &&
    Number(duration) <= 30
  const copying = encoding?.videoCodec === 'copy'
  const issues = encoding ? encodingIssues(encoding, supportedNvidiaEncoders) : []
  const canGenerate =
    ready &&
    !!job &&
    !busy &&
    !isEncoding &&
    startValid &&
    durationValid &&
    !copying &&
    issues.length === 0

  useEffect(() => {
    mounted.current = true
    const remove = window.api.onEncodingProgress(({ jobId, progress }) => {
      if (running.current && jobId.startsWith('preview-')) setProgress(progress)
    })
    return () => {
      mounted.current = false
      remove()
      if (running.current) void window.api.cancelPreview().catch(console.error)
      if (resultId.current) void window.api.releasePreview(resultId.current).catch(console.error)
    }
  }, [])

  const generate = async (): Promise<void> => {
    if (!canGenerate || !encoding || !job || running.current) return
    running.current = true
    canceled.current = false
    setBusy(true)
    setProgress(0)
    setError(null)
    try {
      const previous = resultId.current
      resultId.current = null
      setResult(null)
      // Allow the player to unmount and release Windows media handles.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (previous) await window.api.releasePreview(previous)
      if (!mounted.current || canceled.current) throw new Error('Preview canceled')
      const clip = await window.api.createPreview({
        encoding,
        startSeconds: Number(start),
        durationSeconds: Number(duration)
      })
      if (!mounted.current || canceled.current) {
        await window.api.releasePreview(clip.id)
        if (mounted.current) setError('Preview canceled')
        return
      }
      resultId.current = clip.id
      setResult({ ...clip, signature, name: job.file.name })
      setProgress(100)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }

  const cancel = async (): Promise<void> => {
    canceled.current = true
    try {
      await window.api.cancelPreview()
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const openPlayer = async (separateWindow = false): Promise<void> => {
    if (!result) return
    try {
      if (separateWindow) await window.api.openPreviewWindow(result.id)
      else await window.api.openPreview(result.id)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return {
    jobs,
    job,
    encoding,
    start,
    setStart,
    duration,
    setDuration,
    setSelectedId,
    busy,
    progress,
    result,
    error,
    signature,
    startValid,
    durationValid,
    knownDuration,
    copying,
    issues,
    canGenerate,
    ready,
    checking,
    isEncoding,
    generate,
    cancel,
    openPlayer
  }
}

export type VideoPreviewSession = ReturnType<typeof useVideoPreview>
