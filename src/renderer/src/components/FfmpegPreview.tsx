import { Card, CardBody, CardHeader } from '@heroui/react'

interface FfmpegPreviewProps {
  outputFormat: string // container/extension
  outputDirectory: string
  regexPattern: string // rename pattern with tokens {name} {codec} {ext}
  threads: number
  inputFiles: string[]
  videoCodec?: string
  audioCodec?: string
  audioChannels?: string
  audioBitrate?: number
  volumeDb?: number
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
  volumeDb = 0
}: FfmpegPreviewProps): React.JSX.Element {
  const generateFfmpegCommand = (): string => {
    if (inputFiles.length === 0) {
      return `ffmpeg -i input.mp4 -c:v ${videoCodec} -c:a ${audioCodec} output.${outputFormat}`
    }

    const inputArgs = inputFiles.map((file) => `-i "${file}"`).join(' ')
    const videoPart = `-c:v ${videoCodec}`
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
    const baseName = 'example'
    const codecToken = videoCodec.replace('lib', '')
    const outputFile = (regexPattern || '{name}')
      .replace(/{name}/g, baseName)
      .replace(/{codec}/g, codecToken)
      .replace(/{ext}/g, outputFormat)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileWithExt = outputFile.endsWith('.' + outputFormat)
      ? outputFile
      : `${outputFile}.${outputFormat}`

    return `ffmpeg ${inputArgs} ${videoPart} ${audioPart}${channelPart}${bitratePart}${volumePart} ${threadArg} "${outputDirectory}/${fileWithExt}"`.trim()
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
          This is the FFmpeg command that will be executed when you start encoding.
        </p>
      </CardBody>
    </Card>
  )
}
