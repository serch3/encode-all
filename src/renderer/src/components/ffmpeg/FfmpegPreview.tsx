import { Card, CardBody, CardHeader } from '@heroui/react'
import { buildFilenameFromPattern } from '../../utils/pattern'
import type { PatternTokens } from '../../types'
import type { EncodingOptions } from '../../../../preload/api.types'
import {
  buildSinglePassFfmpegArgs,
  buildTwoPassFfmpegArgs,
  canUseTwoPass
} from '../../../../shared/ffmpegArgs'

const quoteArg = (arg: string): string => {
  if (/^[A-Za-z0-9._:/\\?=-]+$/.test(arg)) {
    return arg
  }
  return `"${arg.replace(/"/g, '\\"')}"`
}

const isWindowsPreview = (): boolean => {
  return navigator.userAgent.toLowerCase().includes('windows')
}

interface FfmpegPreviewProps {
  outputFormat: string
  outputDirectory: string
  regexPattern: string // rename pattern with tokens {name} {codec} {ext}
  threads: number // ffmpeg threads flag
  inputFiles: string[]
  encodingError?: string | null
  onClearError?: () => void
  videoCodec?: string
  audioCodec?: string
  audioChannels?: string
  audioBitrate?: number
  volumeDb?: number
  trackSelection?: string
  crf?: number
  preset?: string
  twoPass?: boolean
  subtitleMode?: string
  videoBitrate?: number
  rateControlMode?: 'crf' | 'bitrate'
  ffmpegPath?: string
}

export default function FfmpegPreview({
  outputFormat,
  outputDirectory,
  regexPattern,
  threads,
  inputFiles,
  encodingError,
  onClearError,
  videoCodec = 'libx265',
  audioCodec = 'aac',
  audioChannels = 'same',
  audioBitrate = 128,
  volumeDb = 0,
  trackSelection = 'auto',
  crf = 23,
  preset = 'medium',
  twoPass = false,
  subtitleMode = 'none',
  videoBitrate = 2500,
  rateControlMode = 'crf',
  ffmpegPath
}: FfmpegPreviewProps): React.JSX.Element {
  const generateFfmpegCommand = (): string => {
    const executable = ffmpegPath ? `"${ffmpegPath}"` : 'ffmpeg'

    // For batch preview, we only show the command for the FIRST file
    // to avoid confusion about how batch processing works (it's 1:1, not N:1)
    const firstFile = inputFiles[0] ?? 'input.mp4'
    const tokens: PatternTokens = {
      name: 'example',
      codec: videoCodec.replace('lib', ''),
      ext: outputFormat
    }
    const outputFile = buildFilenameFromPattern(regexPattern, tokens)
    const fileWithExt = outputFile.endsWith('.' + outputFormat)
      ? outputFile
      : `${outputFile}.${outputFormat}`
    const outputPath = outputDirectory
      ? `${outputDirectory}/${fileWithExt}`
      : `<output-folder>/${fileWithExt}`

    const options: EncodingOptions = {
      inputPath: firstFile,
      outputPath,
      container: outputFormat,
      videoCodec,
      audioCodec,
      audioChannels,
      audioBitrate,
      volumeDb,
      crf,
      preset,
      threads,
      trackSelection,
      ffmpegPath,
      enableLogging: false,
      twoPass,
      subtitleMode,
      videoBitrate,
      rateControlMode
    }

    if (canUseTwoPass(options)) {
      const { pass1Args, pass2Args } = buildTwoPassFfmpegArgs(
        options,
        outputPath,
        'ffmpeg2pass-preview',
        isWindowsPreview() ? 'NUL' : '/dev/null'
      )
      return [
        `${executable} ${pass1Args.map(quoteArg).join(' ')}`,
        `${executable} ${pass2Args.map(quoteArg).join(' ')}`
      ].join('\n')
    }

    return `${executable} ${buildSinglePassFfmpegArgs(options, outputPath).map(quoteArg).join(' ')}`
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <h3 className="text-lg font-semibold">FFmpeg Command Preview</h3>
      </CardHeader>
      <CardBody>
        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg font-mono text-sm overflow-x-auto">
          <code className="whitespace-pre-wrap">{generateFfmpegCommand()}</code>
        </div>
        {encodingError && (
          <div className="text-xs text-danger flex items-center justify-between gap-3">
            <span className="truncate">Last error: {encodingError}</span>
            {onClearError && (
              <button className="text-xs underline" onClick={onClearError}>
                clear
              </button>
            )}
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">
          This command will be executed for <strong>each</strong> selected file.
          {inputFiles.length > 1 && ` (Showing preview for 1 of ${inputFiles.length} files)`}
        </p>
      </CardBody>
    </Card>
  )
}
