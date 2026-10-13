import { useEffect, useState } from 'react'
import { Card, CardBody, CardHeader } from '@heroui/react'
import type { QueuedJob, EncodingOptions } from '../../types'
import type { EncodingConfig } from '../../hooks/useEncodingConfig'
import { outputFilename, previewEncodingOptions } from '../../utils/encodingOptions'
import {
  buildSinglePassFfmpegArgs,
  buildTwoPassFfmpegArgs,
  canUseTwoPass
} from '../../../../shared/ffmpegArgs'

const quoteArg = (arg: string): string =>
  /^[A-Za-z0-9._:/\\?=-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`

interface Props {
  job?: QueuedJob
  config: EncodingConfig
  ffmpegPath?: string
  encodingError?: string | null
  onClearError?: () => void
}

export default function FfmpegPreview({
  job,
  config,
  ffmpegPath,
  encodingError,
  onClearError
}: Props): React.JSX.Element {
  const encoding = job ? previewEncodingOptions(job, config, ffmpegPath) : null
  const requestKey = JSON.stringify(
    job
      ? {
          path: job.file.path,
          name: job.file.name,
          encoding,
          directory: config.outputDirectory,
          pattern: config.renamePattern
        }
      : null
  )
  const [output, setOutput] = useState<{ key: string; path: string } | null>(null)
  const [pathError, setPathError] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    setOutput(null)
    setPathError(null)
    const request = JSON.parse(requestKey) as {
      path: string
      name: string
      encoding: EncodingOptions
      directory: string
      pattern: string
    } | null
    if (request)
      void (async () => {
        try {
          const directory = request.directory || (await window.api.pathJoin(request.path, '..'))
          const path = await window.api.pathJoin(
            directory,
            outputFilename(request.name, request.encoding, request.pattern)
          )
          if (current) setOutput({ key: requestKey, path })
        } catch (cause) {
          if (current) setPathError(cause instanceof Error ? cause.message : String(cause))
        }
      })()
    return () => {
      current = false
    }
  }, [requestKey])
  const outputPath = output?.key === requestKey ? output.path : undefined
  let command = ''
  if (encoding && outputPath) {
    const options = { ...encoding, outputPath }
    const executable = quoteArg(ffmpegPath || 'ffmpeg')
    if (canUseTwoPass(options)) {
      const { pass1Args, pass2Args } = buildTwoPassFfmpegArgs(
        options,
        outputPath,
        'ffmpeg2pass-preview',
        window.electron?.process.platform === 'win32' ? 'NUL' : '/dev/null'
      )
      command = [pass1Args, pass2Args]
        .map((args) => `${executable} ${args.map(quoteArg).join(' ')}`)
        .join('\n')
    } else
      command = `${executable} ${buildSinglePassFfmpegArgs(options, outputPath).map(quoteArg).join(' ')}`
  }
  return (
    <Card className="w-full">
      <CardHeader>
        <h3 className="text-lg font-semibold">FFmpeg Command Preview</h3>
      </CardHeader>
      <CardBody className="gap-2">
        {command ? (
          <pre className="bg-content2 p-3 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all select-text">
            {command}
          </pre>
        ) : (
          <p className="text-sm text-default-500">
            {job
              ? pathError || 'Preparing the output path…'
              : 'Select a video in the queue to inspect its command.'}
          </p>
        )}
        {job && (
          <p className="text-xs text-default-500">
            Uses {job.file.name} and its per-file overrides. Review batch outputs to see any
            numbered filenames.
          </p>
        )}
        {encodingError && (
          <div className="text-xs text-danger flex items-start justify-between gap-3">
            <span className="break-words">Last error: {encodingError}</span>
            {onClearError && (
              <button type="button" className="underline" onClick={onClearError}>
                Clear error
              </button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
