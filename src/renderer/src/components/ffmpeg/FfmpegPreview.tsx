import { Card, CardBody, CardHeader } from '@heroui/react'
import { buildFilenameFromPattern } from '../../utils/pattern'
import type { PatternTokens } from '../../types'

interface FfmpegPreviewProps {
  outputFormat: string
  outputDirectory: string
  regexPattern: string // rename pattern with tokens {name} {codec} {ext}
  threads: number // ffmpeg threads flag
  inputFiles: string[]
  videoCodec?: string
  audioCodec?: string
  audioChannels?: string
  audioBitrate?: number
  volumeDb?: number
  trackSelection?: string
  crf?: number
  preset?: string
  ffmpegPath?: string
}

export default function FfmpegPreview({
  outputFormat,
  outputDirectory,
  regexPattern,
  threads,
  inputFiles,
  videoCodec = 'libx265',
  audioCodec = 'aac',
  audioChannels = 'same',
  audioBitrate = 128,
  volumeDb = 0,
  trackSelection = 'auto',
  crf = 23,
  preset = 'medium',
  ffmpegPath
}: FfmpegPreviewProps): React.JSX.Element {
  const generateFfmpegCommand = (): string => {
    const isNvenc = videoCodec.includes('nvenc')
    const qualityFlag = isNvenc ? '-cq' : '-crf'
    const executable = ffmpegPath ? `"${ffmpegPath}"` : 'ffmpeg'

    if (inputFiles.length === 0) {
      return `${executable} -i input.mp4 -c:v ${videoCodec} ${qualityFlag} ${crf} -preset ${preset} -c:a ${audioCodec} output.${outputFormat}`
    }

    // For batch preview, we only show the command for the FIRST file
    // to avoid confusion about how batch processing works (it's 1:1, not N:1)
    const firstFile = inputFiles[0]
    const inputArgs = `-i "${firstFile}"`
    
    let mapPart = ''
    let subtitlePart = ''

    if (trackSelection === 'all') {
      mapPart = '-map 0'
      // Try to copy subtitles if container supports it (mostly MKV)
      // For MP4, this might fail if input is PGS, but user is warned
      subtitlePart = '-c:s copy'
    } else if (trackSelection === 'all_audio') {
      mapPart = '-map 0:v -map 0:a'
      // Explicitly disable subtitles to be safe, or just don't map them
      // If we map specific streams, unmapped ones are dropped
    }
    // 'auto' uses default ffmpeg selection (1 video, 1 audio, 1 sub usually)

    const videoPart = `-c:v ${videoCodec} ${qualityFlag} ${crf} -preset ${preset}`
    const audioPart = audioCodec === 'copy' ? '-c:a copy' : `-c:a ${audioCodec}`
    const channelPart =
      audioChannels !== 'same'
        ? ` -ac ${
            audioChannels === 'mono'
              ? 1
              : audioChannels === 'stereo'
                ? 2
                : audioChannels === '5.1'
                  ? 6
                  : ''
          }`
        : ''
    const bitratePart = audioCodec !== 'copy' && audioBitrate > 0 ? ` -b:a ${audioBitrate}k` : ''
    const volumePart = volumeDb !== 0 ? ` -filter:a "volume=${volumeDb}dB"` : ''

    const threadArg = threads > 0 ? `-threads ${threads}` : ''
    // build output file name from pattern tokens
    const tokens: PatternTokens = {
      name: 'example',
      codec: videoCodec.replace('lib', ''),
      ext: outputFormat
    }
    const outputFile = buildFilenameFromPattern(regexPattern, tokens)
    const fileWithExt = outputFile.endsWith('.' + outputFormat)
      ? outputFile
      : `${outputFile}.${outputFormat}`

    return `${executable} ${inputArgs} ${mapPart} ${videoPart} ${audioPart}${channelPart}${bitratePart}${volumePart} ${subtitlePart} ${threadArg} "${outputDirectory}/${fileWithExt}"`.trim()
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <h3 className="text-lg font-semibold">FFmpeg Command Preview</h3>
      </CardHeader>
      <CardBody>
        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg font-mono text-sm overflow-x-auto">
          <code>{generateFfmpegCommand()}</code>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          This command will be executed for <strong>each</strong> selected file.
          {inputFiles.length > 1 && ` (Showing preview for 1 of ${inputFiles.length} files)`}
        </p>
      </CardBody>
    </Card>
  )
}
