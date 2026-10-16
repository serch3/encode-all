import { useEffect, useRef, useState } from 'react'
import { Button, Card, CardBody, Input, Progress, Select, SelectItem, Spinner } from '@heroui/react'
import { Clapperboard, ExternalLink, Play, Settings2, ListVideo, MonitorUp } from 'lucide-react'
import type { VideoPreviewSession } from '../../hooks/useVideoPreview'

interface Props {
  preview: VideoPreviewSession
  onAdjustSettings: () => void
  onOpenQueue: () => void
  onSetupFfmpeg: () => void
}

export default function VideoPreview({
  preview,
  onAdjustSettings,
  onOpenQueue,
  onSetupFfmpeg
}: Props): React.JSX.Element {
  const [playbackError, setPlaybackError] = useState(false)
  const player = useRef<HTMLVideoElement>(null)
  const sourcePlayer = useRef<HTMLVideoElement>(null)
  const [compare, setCompare] = useState(false)
  const [sourceError, setSourceError] = useState(false)
  useEffect(() => {
    setPlaybackError(false)
    setSourceError(false)
    setCompare(false)
  }, [preview.result?.id])
  const { job, encoding, result, busy } = preview
  const syncSource = (play = false): void => {
    const source = sourcePlayer.current
    const output = player.current
    if (!source || !output || sourceError) return
    const position = (result?.sourceStartSeconds ?? 0) + output.currentTime
    if (Math.abs(source.currentTime - position) > 0.15) source.currentTime = position
    source.playbackRate = output.playbackRate
    if (play) void source.play().catch(() => setSourceError(true))
  }
  const stale = result && job && result.signature !== preview.signature
  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto pb-4">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Preview</h1>
          <p className="text-sm text-default-500">
            Test a short sample before encoding your batch.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="flat"
            startContent={<ListVideo size={16} />}
            onPress={onOpenQueue}
          >
            Video queue
          </Button>
          <Button
            size="sm"
            variant="flat"
            startContent={<Settings2 size={16} />}
            onPress={onAdjustSettings}
          >
            Adjust settings
          </Button>
        </div>
      </div>

      {stale && (
        <p
          role="status"
          className="text-sm text-warning-700 dark:text-warning-400 bg-warning/10 rounded-lg p-3"
        >
          Settings changed. Generate a new preview to see the current quality.
        </p>
      )}
      {result?.sourceUrl && (
        <Button
          className="self-start"
          size="sm"
          variant="flat"
          aria-pressed={compare}
          onPress={() => {
            player.current?.pause()
            sourcePlayer.current?.pause()
            setCompare((value) => !value)
          }}
        >
          Compare source and output
        </Button>
      )}
      <div className={compare ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : ''}>
        {compare && result?.sourceUrl && (
          <div className="relative bg-black rounded-xl overflow-hidden h-[clamp(220px,42vh,460px)] flex items-center justify-center">
            <span className="absolute top-3 left-3 z-10 text-xs text-white bg-black/60 rounded px-2 py-1">
              Source · muted
            </span>
            {!sourceError ? (
              <video
                ref={sourcePlayer}
                src={result.sourceUrl}
                muted
                preload="metadata"
                aria-label="Original source comparison"
                className="h-full w-full object-contain"
                onLoadedMetadata={() => syncSource()}
                onError={() => setSourceError(true)}
              />
            ) : (
              <p className="text-sm text-zinc-300 p-6 text-center">
                This source format cannot play here. The encoded sample remains available.
              </p>
            )}
          </div>
        )}
        <div className="relative bg-black rounded-xl overflow-hidden h-[clamp(220px,42vh,460px)] flex items-center justify-center">
          {compare && (
            <span className="absolute top-3 left-3 z-10 text-xs text-white bg-black/60 rounded px-2 py-1">
              Encoded sample · playback controls
            </span>
          )}
          {result && !playbackError ? (
            <video
              ref={player}
              key={result.id}
              src={result.url}
              controls
              preload="metadata"
              className="h-full w-full object-contain"
              aria-label="Encoded quality preview"
              onError={() => setPlaybackError(true)}
              onPlay={() => syncSource(true)}
              onPause={() => sourcePlayer.current?.pause()}
              onSeeking={() => syncSource()}
              onTimeUpdate={() => syncSource(!player.current?.paused)}
              onRateChange={() => syncSource()}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 text-center text-zinc-300">
              {busy ? (
                <Spinner size="lg" aria-label="Encoding preview sample" />
              ) : (
                <Clapperboard size={42} strokeWidth={1.5} className="text-zinc-500" />
              )}
              <p className="font-medium">
                {busy
                  ? 'Encoding your sample…'
                  : playbackError
                    ? 'This format needs a system player'
                    : 'Your video preview appears here'}
              </p>
              <p className="text-sm text-zinc-400 max-w-md">
                {busy
                  ? 'You can switch tabs while the sample is prepared.'
                  : playbackError
                    ? 'Use Open in System Player below to inspect the encoded sample.'
                    : job
                      ? 'Choose a position and duration, then generate a sample with your current settings.'
                      : 'Add a video to the queue to get started.'}
              </p>
              {!job && (
                <Button variant="flat" onPress={onAdjustSettings}>
                  Add videos
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {busy && <Progress aria-label="Preview encoding progress" value={preview.progress} />}
      {result && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-default-600 min-w-0 break-words">
            <span className="font-medium">{result.name}</span> · {result.durationSeconds.toFixed(1)}{' '}
            seconds · {(result.size / 1024 / 1024).toFixed(2)} MB
            {stale ? ' · Previous settings' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="flat"
              startContent={<MonitorUp size={16} />}
              onPress={() => {
                player.current?.pause()
                void preview.openPlayer(true)
              }}
            >
              Open Preview Window
            </Button>
            <Button
              size="sm"
              variant="flat"
              startContent={<ExternalLink size={16} />}
              onPress={() => {
                player.current?.pause()
                void preview.openPlayer()
              }}
            >
              Open in System Player
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardBody className="gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Preview file"
              placeholder="Choose a video"
              selectedKeys={job ? [job.id] : []}
              isDisabled={busy || preview.isEncoding || !preview.jobs.length}
              onSelectionChange={(keys) => preview.setSelectedId(String(Array.from(keys)[0] ?? ''))}
            >
              {preview.jobs.map((item) => (
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
              value={preview.start}
              onValueChange={preview.setStart}
              isInvalid={!preview.startValid}
              errorMessage={
                preview.knownDuration
                  ? 'Choose a position before the end of the video.'
                  : 'Use a nonnegative start time.'
              }
              isDisabled={busy || preview.isEncoding}
            />
            <Input
              label="Duration (seconds)"
              type="number"
              min={1}
              max={30}
              step="1"
              value={preview.duration}
              onValueChange={preview.setDuration}
              isInvalid={!preview.durationValid}
              errorMessage="Use a duration of 1–30 seconds."
              isDisabled={busy || preview.isEncoding}
            />
          </div>
          {preview.knownDuration !== undefined && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-default-500 shrink-0">Position</span>
              <input
                type="range"
                aria-label="Preview position"
                min={0}
                max={Math.max(0, preview.knownDuration - 0.1)}
                step="0.1"
                value={Math.min(
                  Math.max(0, Number(preview.start) || 0),
                  preview.knownDuration - 0.1
                )}
                onChange={(event) => preview.setStart(event.target.value)}
                disabled={busy || preview.isEncoding}
                className="w-full accent-primary"
              />
              <span className="text-xs text-default-500 shrink-0">
                {Math.round(preview.knownDuration)}s total
              </span>
            </div>
          )}
          {encoding && (
            <p className="text-xs text-default-600">
              {encoding.container.toUpperCase()} · {encoding.videoCodec} ·{' '}
              {encoding.videoCodec === 'copy'
                ? 'Original quality'
                : encoding.rateControlMode === 'bitrate'
                  ? encoding.targetSizeMb
                    ? `Target ${encoding.targetSizeMb} MB per file (approximate)`
                    : `${encoding.videoBitrate} kbps`
                  : `Quality ${encoding.crf}`}{' '}
              · {encoding.audioCodec}. Includes this file’s queue overrides.
            </p>
          )}
          {preview.checking && (
            <p role="status" className="text-sm text-default-600">
              Checking FFmpeg and available encoders…
            </p>
          )}
          {!preview.ready && !preview.checking && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-warning-700 dark:text-warning-400">
                Set up FFmpeg to generate a preview.
              </p>
              <Button size="sm" variant="flat" color="warning" onPress={onSetupFfmpeg}>
                Set up FFmpeg
              </Button>
            </div>
          )}
          {preview.copying && (
            <p className="text-sm text-default-500">
              Stream copy preserves the original quality. Choose a video encoder to preview
              compression.
            </p>
          )}
          {preview.issues.length > 0 && (
            <p role="alert" className="text-sm text-danger">
              {preview.issues.join(' ')}
            </p>
          )}
          {preview.isEncoding && (
            <p role="status" className="text-sm text-default-600">
              Wait for the current batch to finish before generating a preview.
            </p>
          )}
          {preview.error && (
            <p role="alert" className="text-sm text-danger">
              {preview.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              color="primary"
              startContent={<Play size={16} />}
              onPress={preview.generate}
              isLoading={busy}
              isDisabled={!preview.canGenerate}
            >
              Generate Preview
            </Button>
            {busy && (
              <Button variant="flat" onPress={preview.cancel}>
                Cancel Preview
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
