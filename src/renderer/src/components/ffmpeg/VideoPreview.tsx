import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Progress,
  Select,
  SelectItem
} from '@heroui/react'
import { Play, ExternalLink } from 'lucide-react'
import type { QueuedJob } from '../../types'
import type { PreviewResult } from '../../../../preload/api.types'
import type { EncodingConfig } from '../../hooks/useEncodingConfig'
import { previewEncodingOptions } from '../../utils/encodingOptions'

interface Props {
  jobs: QueuedJob[]
  config: EncodingConfig
  ffmpegPath?: string
  ready: boolean
  isEncoding: boolean
  onBusyChange: (busy: boolean) => void
}

export default function VideoPreview({
  jobs,
  config,
  ffmpegPath,
  ready,
  isEncoding,
  onBusyChange
}: Props): React.JSX.Element {
  const [selectedId, setSelectedId] = useState('')
  const [start, setStart] = useState('0')
  const [duration, setDuration] = useState('30')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<(PreviewResult & { signature: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playbackError, setPlaybackError] = useState(false)
  const mounted = useRef(true)
  const resultId = useRef<string | null>(null)
  const job = jobs.find((item) => item.id === selectedId) ?? jobs[0]
  const encoding = job ? previewEncodingOptions(job, config, ffmpegPath) : null
  const signature = JSON.stringify({ encoding, start, duration })
  const validRange =
    Number.isFinite(Number(start)) &&
    Number(start) >= 0 &&
    Number(duration) >= 1 &&
    Number(duration) <= 30
  const copying = encoding?.videoCodec === 'copy'

  useEffect(() => {
    mounted.current = true
    const removeProgress = window.api.onEncodingProgress(({ jobId, progress }) => {
      if (jobId.startsWith('preview-')) setProgress(progress)
    })
    return () => {
      mounted.current = false
      removeProgress()
      void window.api.cancelPreview().catch(console.error)
      if (resultId.current) void window.api.releasePreview(resultId.current).catch(console.error)
      onBusyChange(false)
    }
  }, [onBusyChange])

  const generate = async (): Promise<void> => {
    if (!encoding || busy || isEncoding || !ready || !validRange || copying) return
    setBusy(true)
    onBusyChange(true)
    setProgress(0)
    setError(null)
    setPlaybackError(false)
    try {
      // Release the media element before deleting its file on Windows.
      const previousId = resultId.current
      resultId.current = null
      setResult(null)
      if (previousId) await window.api.releasePreview(previousId)
      const preview = await window.api.createPreview({
        encoding,
        startSeconds: Number(start),
        durationSeconds: Number(duration)
      })
      if (!mounted.current) {
        await window.api.releasePreview(preview.id)
        return
      }
      resultId.current = preview.id
      setResult({ ...preview, signature })
      setProgress(100)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (mounted.current) setBusy(false)
      onBusyChange(false)
    }
  }

  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex flex-col items-start gap-1">
        <h3 className="text-lg font-semibold">Quality Preview</h3>
        <p className="text-sm text-default-500">
          Encode a sample of up to 30 seconds before starting the batch. Uses this file’s settings,
          including queue overrides.
        </p>
      </CardHeader>
      <CardBody className="gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="Preview file"
            selectedKeys={job ? [job.id] : []}
            isDisabled={busy || isEncoding || !jobs.length}
            onSelectionChange={(keys) => setSelectedId(String(Array.from(keys)[0] ?? ''))}
          >
            {jobs.map((item) => (
              <SelectItem key={item.id} textValue={item.file.name}>
                {item.file.name}
              </SelectItem>
            ))}
          </Select>
          <Input
            label="Start time (seconds)"
            type="number"
            min={0}
            step="0.1"
            value={start}
            onValueChange={setStart}
            isDisabled={busy || isEncoding}
          />
          <Input
            label="Duration (seconds)"
            type="number"
            min={1}
            max={30}
            step="1"
            value={duration}
            onValueChange={setDuration}
            isInvalid={!validRange}
            errorMessage="Use a nonnegative start and a duration of 1–30 seconds."
            isDisabled={busy || isEncoding}
          />
        </div>
        {!ready && <p className="text-sm text-warning">Set up FFmpeg to generate a preview.</p>}
        {!job && (
          <p className="text-sm text-default-500">
            Add and select a video in the queue to preview it.
          </p>
        )}
        {copying && (
          <p className="text-sm text-default-500">
            Stream copy preserves the original quality. Choose a video encoder to preview
            compression.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            color="primary"
            variant="flat"
            startContent={<Play size={16} />}
            onPress={generate}
            isLoading={busy}
            isDisabled={!ready || !job || isEncoding || !validRange || copying}
          >
            Generate Preview
          </Button>
          {busy && (
            <Button variant="flat" onPress={() => window.api.cancelPreview()}>
              Cancel Preview
            </Button>
          )}
        </div>
        {busy && <Progress aria-label="Preview encoding progress" value={progress} />}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {result && (
          <div className="space-y-3">
            {result.signature !== signature && (
              <p role="status" className="text-sm text-warning">
                Settings changed. Generate a new preview to see the current quality.
              </p>
            )}
            {!playbackError && (
              <video
                key={result.id}
                src={result.url}
                controls
                preload="metadata"
                className="w-full max-h-80 rounded-lg bg-black"
                aria-label="Encoded quality preview"
                onError={() => setPlaybackError(true)}
              />
            )}
            <p className="text-xs text-default-500">
              {result.durationSeconds.toFixed(1)} seconds · {(result.size / 1024 / 1024).toFixed(2)}{' '}
              MB. Playback support depends on the selected codec and container.
            </p>
            {playbackError && (
              <p className="text-sm text-warning">
                This format needs a system player. Open the encoded sample below to inspect its
                quality.
              </p>
            )}
            <Button
              variant="flat"
              size="sm"
              startContent={<ExternalLink size={14} />}
              onPress={async () => {
                try {
                  await window.api.openPreview(result.id)
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : String(cause))
                }
              }}
            >
              Open in System Player
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
